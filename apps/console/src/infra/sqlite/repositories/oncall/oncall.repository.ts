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
  MarkOncallPingFailedInput,
  MarkOncallPingFiredInput,
  OncallRepository,
  ReclaimStaleRunningPingsInput,
  ReclaimStaleRunningPingsResult,
} from "#/infra/sqlite/repositories/oncall/oncall.interface";

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
      const error = input.error ?? "Urgent call timed out before completion";
      const rows = await context.db
        .selectFrom("oncall_pings")
        .selectAll()
        .where("state", "=", "running")
        .where("updated_at", "<=", input.staleBefore)
        .execute();
      let reclaimed = 0;

      for (const row of rows) {
        const current = requireOncallPing(await repository.get(row.id));

        if (current.state !== "running") {
          continue;
        }

        await repository.markFailed({
          pingId: row.id,
          error,
          retryAt: current.attemptCount < current.maxAttempts ? now : null,
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
