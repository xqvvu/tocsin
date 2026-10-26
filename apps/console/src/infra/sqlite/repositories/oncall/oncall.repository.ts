import { sql } from "kysely";

import { redactText } from "@tocsin/core";
import type { OncallPing } from "@tocsin/core";

import type { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { requireDestination } from "#/infra/sqlite/repositories/destination/destination.helpers";
import type { DestinationRepository } from "#/infra/sqlite/repositories/destination/destination.interface";
import { SqliteDestinationRepository } from "#/infra/sqlite/repositories/destination/destination.repository";
import { requireEvent } from "#/infra/sqlite/repositories/intake/intake.helpers";
import type { IntakeRepository } from "#/infra/sqlite/repositories/intake/intake.interface";
import { SqliteIntakeRepository } from "#/infra/sqlite/repositories/intake/intake.repository";
import {
  findOncallDedupeKey,
  oncallPingFromRow,
  pruneOncallDedupeKeys,
  requireOncallPing,
  saveOncallDedupeKey,
} from "#/infra/sqlite/repositories/oncall/oncall.helpers";
import type {
  ClaimOncallPingsInput,
  ClaimedOncallPing,
  EnqueueOncallPingInput,
  MarkOncallPingDispatchStartedInput,
  MarkOncallPingFailedInput,
  MarkOncallPingFiredInput,
  OncallRepository,
  ReclaimStaleRunningPingsInput,
  ReclaimStaleRunningPingsResult,
} from "#/infra/sqlite/repositories/oncall/oncall.interface";

const STALE_RUNNING_ERROR = "Urgent call timed out before completion";

/**
 * Terminal message for a stale attempt that may already have rung.
 *
 * `dispatch_started_at` is written right before the provider is asked to call,
 * so a stale `running` row carrying the marker cannot be retried without
 * risking a second call to the same engineer. The text points the operator at
 * the explicit re-page path instead of implying the call never happened.
 */
const DISPATCH_UNKNOWN_ERROR =
  "Urgent call may have been placed before the worker stopped; it was not retried automatically";

export class SqliteOncallRepository implements OncallRepository {
  constructor(
    private readonly context: SqliteRepositoryContext,
    private readonly destinations: DestinationRepository,
    private readonly intake: IntakeRepository,
  ) {}

  enqueueForDelivery(input: EnqueueOncallPingInput): Promise<OncallPing | null> {
    return this.context.runInTransaction(async (context) => {
      const repository = this.withContext(context);
      const now = input.now ?? this.context.now();

      await pruneOncallDedupeKeys(context.db, input.dedupeWindowStartsAt);

      // A card resend is the same delivery, not a new alert. Any ping already
      // recorded for this delivery and receiver — whatever its state — proves
      // the receiver was paged; `failed` is ambiguous because a placed call
      // whose terminal state could not be persisted is also recorded as
      // `failed`. Ringing again is irreversible, so stay pinned and leave a
      // deliberate re-page to the manual buzz path.
      if (input.dedupeByDelivery) {
        const alreadyPaged = await context.db
          .selectFrom("oncall_pings")
          .select("id")
          .where("delivery_id", "=", input.deliveryId)
          .where("receiver", "=", input.receiver)
          .executeTakeFirst();

        if (alreadyPaged) {
          return null;
        }
      }

      const existing = await findOncallDedupeKey(
        context.db,
        {
          fingerprint: input.fingerprint,
          destination_id: input.destinationId,
          receiver: input.receiver,
        },
        input.dedupeWindowStartsAt,
      );

      if (existing) {
        return null;
      }

      const id = input.id ?? this.context.ids.oncallPing();

      await context.db
        .insertInto("oncall_pings")
        .values({
          id,
          delivery_id: input.deliveryId,
          destination_id: input.destinationId,
          event_id: input.eventId,
          fingerprint: input.fingerprint,
          receiver: input.receiver,
          channel: input.channel,
          state: "scheduled",
          provider_ref_type: input.providerReference.type,
          provider_ref_value: input.providerReference.value,
          attempt_count: 0,
          max_attempts: input.maxAttempts ?? 3,
          next_attempt_at: null,
          last_error: null,
          trigger: input.trigger,
          initiated_by: input.initiatedBy ?? null,
          suppress_reason: null,
          created_at: now,
          updated_at: now,
          fired_at: null,
        })
        .execute();

      await saveOncallDedupeKey(context.db, {
        fingerprint: input.fingerprint,
        destination_id: input.destinationId,
        receiver: input.receiver,
        first_ping_id: id,
        created_at: now,
      });

      return requireOncallPing(await repository.get(id));
    });
  }

  reclaimStaleRunning(
    input: ReclaimStaleRunningPingsInput,
  ): Promise<ReclaimStaleRunningPingsResult> {
    return this.context.runInTransaction(async (context) => {
      const repository = this.withContext(context);
      const now = input.now ?? this.context.now();
      const error = input.error ?? STALE_RUNNING_ERROR;
      const rows = await context.db
        .selectFrom("oncall_pings")
        .selectAll()
        .where("state", "=", "running")
        .where("updated_at", "<=", input.staleBefore)
        .execute();
      let reclaimed = 0;

      for (const row of rows) {
        // Re-read inside the transaction: another batch may have advanced or
        // already reclaimed the row since the candidate list was selected.
        const current = await context.db
          .selectFrom("oncall_pings")
          .selectAll()
          .where("id", "=", row.id)
          .executeTakeFirst();

        if (!current || current.state !== "running") {
          continue;
        }

        // No dispatch marker means the attempt never reached the provider, so
        // retrying it cannot ring anyone twice. With the marker set the call may
        // already have gone out; stay terminal and leave a deliberate re-page to
        // the manual buzz path.
        const dispatchMayHaveStarted = current.dispatch_started_at !== null;

        await repository.markFailed({
          pingId: row.id,
          error: dispatchMayHaveStarted ? DISPATCH_UNKNOWN_ERROR : error,
          retryAt:
            !dispatchMayHaveStarted && current.attempt_count < current.max_attempts ? now : null,
          updatedAt: now,
        });
        reclaimed += 1;
      }

      return { reclaimed };
    });
  }

  claimNext(input: ClaimOncallPingsInput): Promise<ClaimedOncallPing[]> {
    return this.context.runInTransaction(async (context) => {
      const repository = this.withContext(context);
      const now = input.now ?? this.context.now();
      const rows = await context.db
        .selectFrom("oncall_pings")
        .innerJoin("destinations", "destinations.id", "oncall_pings.destination_id")
        .selectAll("oncall_pings")
        .where("oncall_pings.state", "=", "scheduled")
        .where("destinations.enabled", "=", 1)
        .where((eb) =>
          eb.or([
            eb("oncall_pings.next_attempt_at", "is", null),
            eb("oncall_pings.next_attempt_at", "<=", now),
          ]),
        )
        .whereRef("oncall_pings.attempt_count", "<", "oncall_pings.max_attempts")
        .orderBy((eb) => eb.fn.coalesce("oncall_pings.next_attempt_at", "oncall_pings.created_at"))
        .orderBy("oncall_pings.created_at")
        .limit(input.limit)
        .execute();
      const claimed: ClaimedOncallPing[] = [];

      for (const row of rows) {
        const updateResult = await context.db
          .updateTable("oncall_pings")
          .set({
            state: "running",
            attempt_count: row.attempt_count + 1,
            // Each attempt starts without dispatch evidence, so a marker left
            // by a previous attempt cannot mask a legitimate retry.
            dispatch_started_at: null,
            updated_at: now,
          })
          .where("id", "=", row.id)
          .where("state", "=", "scheduled")
          .executeTakeFirst();

        if (updateResult.numUpdatedRows === 0n) {
          continue;
        }

        const ping = requireOncallPing(await repository.get(row.id));
        const destination = requireDestination(
          await repository.destinations.get(ping.destinationId),
        );
        const event = requireEvent(await repository.intake.get(ping.eventId));

        claimed.push({ ping, destination, event });
      }

      return claimed;
    });
  }

  markFired(input: MarkOncallPingFiredInput): Promise<OncallPing> {
    return this.context.runInTransaction(async (context) => {
      const repository = this.withContext(context);
      const firedAt = input.firedAt ?? this.context.now();

      await context.db
        .updateTable("oncall_pings")
        .set({
          state: "fired",
          next_attempt_at: null,
          last_error: null,
          fired_at: firedAt,
          updated_at: firedAt,
        })
        .where("id", "=", input.pingId)
        .execute();

      return requireOncallPing(await repository.get(input.pingId));
    });
  }

  markFailed(input: MarkOncallPingFailedInput): Promise<OncallPing> {
    return this.context.runInTransaction(async (context) => {
      const repository = this.withContext(context);
      const updatedAt = input.updatedAt ?? this.context.now();
      const current = requireOncallPing(await repository.get(input.pingId));
      const shouldRetry = input.retryAt !== null && current.attemptCount < current.maxAttempts;

      await context.db
        .updateTable("oncall_pings")
        .set({
          state: shouldRetry ? "scheduled" : "failed",
          next_attempt_at: shouldRetry ? input.retryAt : null,
          last_error: redactText(input.error),
          updated_at: updatedAt,
        })
        .where("id", "=", input.pingId)
        .execute();

      return requireOncallPing(await repository.get(input.pingId));
    });
  }

  markDispatchStarted(input: MarkOncallPingDispatchStartedInput): Promise<OncallPing> {
    return this.context.runInTransaction(async (context) => {
      const repository = this.withContext(context);
      const startedAt = input.startedAt ?? this.context.now();

      await context.db
        .updateTable("oncall_pings")
        .set({
          // Keep the earliest intent of this attempt: the executor writes once
          // per claim, and a second write must not push the marker later than
          // the moment the provider may first have rung.
          dispatch_started_at: sql<string>`coalesce(dispatch_started_at, ${startedAt})`,
          // Anchor the stale window to the call instead of the claim, so a batch
          // claimed up front cannot look stale while it is still dialing.
          updated_at: startedAt,
        })
        .where("id", "=", input.pingId)
        .execute();

      return requireOncallPing(await repository.get(input.pingId));
    });
  }

  async listForDelivery(deliveryId: string): Promise<OncallPing[]> {
    const rows = await this.context.db
      .selectFrom("oncall_pings")
      .selectAll()
      .where("delivery_id", "=", deliveryId)
      .orderBy("created_at")
      .orderBy("receiver")
      .execute();

    return rows.map((row) => oncallPingFromRow(row));
  }

  async get(id: string): Promise<OncallPing | null> {
    const row = await this.context.db
      .selectFrom("oncall_pings")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? oncallPingFromRow(row) : null;
  }

  private withContext(context: SqliteRepositoryContext): SqliteOncallRepository {
    const destinations = new SqliteDestinationRepository(context);
    const intake = new SqliteIntakeRepository(context);

    return new SqliteOncallRepository(context, destinations, intake);
  }
}
