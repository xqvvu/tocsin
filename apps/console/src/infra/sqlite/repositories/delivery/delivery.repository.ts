import { sql } from "kysely";

import {
  encodeJson,
  formatSuppressionReason,
  isDeliveryAcceptedUnrecorded,
  redactEventRecord,
  redactText,
  selectSuppressionForDelivery,
  suppressionIsActive,
} from "@tocsin/core";
import type {
  DeliveryAttempt,
  DeliveryDetail,
  DeliveryJob,
  IsoDateTimeString,
  Suppression,
  SuppressionMatchInput,
} from "@tocsin/core";

import type { SqliteRepositoryContext } from "#/infra/sqlite/context";
import {
  attemptFromRow,
  decodeRenderedPayload,
  deliveryFromRow,
  providerReferenceFromRow,
  pruneDedupeKeys,
  redactNullableText,
  requireAttempt,
  requireDelivery,
  reserveDedupeKey,
} from "#/infra/sqlite/repositories/delivery/delivery.helpers";
import type {
  ClaimDeliveriesInput,
  ClaimedDelivery,
  DeliveryRepository,
  EnqueueDeliveriesInput,
  EnqueueDeliveriesResult,
  DedupedDelivery,
  ExistingDeliveryTarget,
  MarkDeliveryFailedInput,
  MarkDeliverySucceededInput,
  ReclaimStaleRunningDeliveriesInput,
  ReclaimStaleRunningDeliveriesResult,
  RetryDeliveryInput,
  SummarizeClaimableDeliveriesInput,
  SummarizeClaimableDeliveriesResult,
} from "#/infra/sqlite/repositories/delivery/delivery.interface";
import {
  DeliveryAlreadyAcceptedError,
  InvalidDeliveryStateError,
} from "#/infra/sqlite/repositories/delivery/delivery.interface";
import {
  destinationMetadataFromRuntime,
  destinationSummaryFromRuntime,
  requireDestination,
} from "#/infra/sqlite/repositories/destination/destination.helpers";
import type { DestinationRepository } from "#/infra/sqlite/repositories/destination/destination.interface";
import { SqliteDestinationRepository } from "#/infra/sqlite/repositories/destination/destination.repository";
import {
  isPrunedRawPayload,
  requireEvent,
} from "#/infra/sqlite/repositories/intake/intake.helpers";
import type { SqliteIntakeRepository } from "#/infra/sqlite/repositories/intake/intake.repository";
import { SqliteIntakeRepository as SqliteIntakeRepositoryImpl } from "#/infra/sqlite/repositories/intake/intake.repository";
import type { OncallRepository } from "#/infra/sqlite/repositories/oncall/oncall.interface";
import { SqliteOncallRepository } from "#/infra/sqlite/repositories/oncall/oncall.repository";
import type { RouteRepository } from "#/infra/sqlite/repositories/route/route.interface";
import { SqliteRouteRepository } from "#/infra/sqlite/repositories/route/route.repository";
import {
  requireSource,
  sourceSummaryFromRuntime,
} from "#/infra/sqlite/repositories/source/source.helpers";
import type { SourceRepository } from "#/infra/sqlite/repositories/source/source.interface";
import { SqliteSourceRepository } from "#/infra/sqlite/repositories/source/source.repository";
import type { SuppressionRepository } from "#/infra/sqlite/repositories/suppression/suppression.interface";
import { SqliteSuppressionRepository } from "#/infra/sqlite/repositories/suppression/suppression.repository";

export class SqliteDeliveryRepository implements DeliveryRepository {
  constructor(
    private readonly context: SqliteRepositoryContext,
    private readonly sources: SourceRepository,
    private readonly destinations: DestinationRepository,
    private readonly routes: RouteRepository,
    private readonly suppressions: SuppressionRepository,
    private readonly intake: SqliteIntakeRepository,
    private readonly oncall: OncallRepository,
  ) {}

  enqueueForEvent(input: EnqueueDeliveriesInput): Promise<EnqueueDeliveriesResult> {
    return this.context.runInTransaction(async (context) => {
      const repository = this.withContext(context);
      const created: DeliveryJob[] = [];
      const deduped: DedupedDelivery[] = [];
      const skippedExisting: ExistingDeliveryTarget[] = [];
      const now = input.now ?? this.context.now();
      const maxAttempts = input.maxAttempts ?? 3;
      const existingTargets = input.skipExistingForEvent
        ? await listExistingTargetsForEvent(context, input.event.id)
        : new Map<string, ExistingDeliveryTarget>();
      // One read decides every `(route, destination)` pair in this enqueue, and
      // the whole enqueue is one transaction, so the suppression set cannot
      // drift between pairs.
      const suppressions = await repository.suppressions.list();

      await pruneDedupeKeys(context.db, input.dedupeWindowStartsAt);

      for (const match of input.matches) {
        for (const destinationId of match.destinationIds) {
          const existingTarget = existingTargets.get(
            deliveryTargetKey(match.routeId, destinationId),
          );

          if (existingTarget) {
            skippedExisting.push(existingTarget);
            continue;
          }

          if (input.dedupeByIdempotency !== false && input.event.idempotencyKey) {
            const dedupe = await reserveDedupeKey(
              context.db,
              {
                source_id: input.event.sourceId,
                idempotency_key: input.event.idempotencyKey,
                route_id: match.routeId,
                destination_id: destinationId,
                first_event_id: input.event.id,
                created_at: now,
              },
              input.dedupeWindowStartsAt,
            );

            if (dedupe !== null) {
              deduped.push({
                sourceId: dedupe.source_id,
                idempotencyKey: dedupe.idempotency_key,
                routeId: dedupe.route_id,
                destinationId: dedupe.destination_id,
                firstEventId: dedupe.first_event_id,
              });
              continue;
            }
          }

          const id = this.context.ids.delivery();
          // Deliveries created inside an active suppression window are born
          // `suppressed`: the audit snapshot is written here so it survives the
          // rule (PRD 2.5), and the row can never be claimed.
          const suppression = selectDeliverySuppression(
            suppressions,
            {
              sourceId: input.event.sourceId,
              destinationId,
              event: input.event.normalized,
            },
            now,
          );
          await context.db
            .insertInto("deliveries")
            .values({
              id,
              event_id: input.event.id,
              destination_id: destinationId,
              route_id: match.routeId,
              state: suppression ? "suppressed" : "pending",
              attempt_count: 0,
              max_attempts: maxAttempts,
              next_attempt_at: null,
              last_error: null,
              rendered_payload_json: null,
              provider_ref_type: null,
              provider_ref_value: null,
              suppression_id: suppression?.id ?? null,
              suppressed_at: suppression ? now : null,
              suppress_reason: suppression ? formatSuppressionReason(suppression) : null,
              created_at: now,
              updated_at: now,
              finished_at: suppression ? now : null,
            })
            .execute();

          created.push(requireDelivery(await repository.getJob(id)));
        }
      }

      return { created, deduped, skippedExisting };
    });
  }

  reclaimStaleRunning(
    input: ReclaimStaleRunningDeliveriesInput,
  ): Promise<ReclaimStaleRunningDeliveriesResult> {
    return this.context.runInTransaction(async (context) => {
      const repository = this.withContext(context);
      const now = input.now ?? this.context.now();
      const error = input.error ?? "Delivery attempt timed out before completion";
      const rows = await context.db
        .selectFrom("deliveries")
        .innerJoin("delivery_attempts", "delivery_attempts.delivery_id", "deliveries.id")
        .selectAll("deliveries")
        .select("delivery_attempts.id as attempt_id")
        .where("deliveries.state", "=", "running")
        .where("delivery_attempts.state", "=", "running")
        .where("delivery_attempts.started_at", "<=", input.staleBefore)
        .orderBy("delivery_attempts.started_at")
        .execute();
      let reclaimed = 0;

      for (const row of rows) {
        const current = requireDelivery(await repository.getJob(row.id));

        if (current.state !== "running") {
          continue;
        }

        await repository.markFailed({
          deliveryId: row.id,
          attemptId: row.attempt_id,
          error,
          retryAt: current.attemptCount < current.maxAttempts ? now : null,
          finishedAt: now,
        });
        reclaimed += 1;
      }

      return { reclaimed };
    });
  }

  claimNext(input: ClaimDeliveriesInput): Promise<ClaimedDelivery[]> {
    return this.context.runInTransaction(async (context) => {
      const repository = this.withContext(context);
      const now = input.now ?? this.context.now();
      const rows = await context.db
        .selectFrom("deliveries")
        .innerJoin("destinations", "destinations.id", "deliveries.destination_id")
        .leftJoin("routes", "routes.id", "deliveries.route_id")
        .selectAll("deliveries")
        .where("deliveries.state", "=", "pending")
        .where("destinations.enabled", "=", 1)
        .where((eb) => eb.or([eb("deliveries.route_id", "is", null), eb("routes.enabled", "=", 1)]))
        .where((eb) =>
          eb.or([
            eb("deliveries.next_attempt_at", "is", null),
            eb("deliveries.next_attempt_at", "<=", now),
          ]),
        )
        .whereRef("deliveries.attempt_count", "<", "deliveries.max_attempts")
        .orderBy((eb) => eb.fn.coalesce("deliveries.next_attempt_at", "deliveries.created_at"))
        .orderBy("deliveries.created_at")
        .limit(input.limit)
        .execute();
      const claimed: ClaimedDelivery[] = [];
      // Execution-time revalidation (PRD 2.4). The window can open while a
      // delivery waits for its first attempt or for retry backoff, so the
      // enqueue-time decision cannot be trusted here. Only rules active *now*
      // are loaded; with none configured this costs one indexed scan and no
      // per-row work.
      const activeSuppressions = (await repository.suppressions.list()).filter((suppression) =>
        suppressionIsActive(suppression, now),
      );

      for (const row of rows) {
        if (activeSuppressions.length > 0) {
          const event = requireEvent(await repository.intake.get(row.event_id));
          const suppression = selectDeliverySuppression(
            activeSuppressions,
            {
              sourceId: event.sourceId,
              destinationId: row.destination_id,
              event: event.normalized,
            },
            now,
          );

          if (suppression) {
            // Terminal, like an enqueue-time suppression: no attempt row, no
            // send, no provider reference — and therefore no on-call ping.
            await context.db
              .updateTable("deliveries")
              .set({
                state: "suppressed",
                suppression_id: suppression.id,
                suppressed_at: now,
                suppress_reason: formatSuppressionReason(suppression),
                next_attempt_at: null,
                updated_at: now,
                finished_at: now,
              })
              .where("id", "=", row.id)
              .where("state", "=", "pending")
              .executeTakeFirst();

            continue;
          }
        }

        const attemptNumber = row.attempt_count + 1;
        const attemptId = this.context.ids.attempt();

        const updateResult = await context.db
          .updateTable("deliveries")
          .set({
            state: "running",
            attempt_count: attemptNumber,
            updated_at: now,
          })
          .where("id", "=", row.id)
          .where("state", "=", "pending")
          .executeTakeFirst();

        if (updateResult.numUpdatedRows > 0n) {
          await context.db
            .insertInto("delivery_attempts")
            .values({
              id: attemptId,
              delivery_id: row.id,
              attempt_number: attemptNumber,
              state: "running",
              response_status: null,
              response_body: null,
              error: null,
              started_at: now,
              finished_at: null,
            })
            .execute();
        } else {
          continue;
        }

        const job = requireDelivery(await repository.getJob(row.id));
        const event = requireEvent(await repository.intake.get(job.eventId));
        const source = requireSource(await repository.sources.get(event.sourceId));
        const destination = requireDestination(
          await repository.destinations.get(job.destinationId),
        );
        const route = job.routeId ? await repository.routes.get(job.routeId) : null;
        const attempt = requireAttempt(await repository.getAttempt(attemptId));

        claimed.push({ job, attempt, event, source, destination, route });
      }

      return claimed;
    });
  }

  /**
   * Counts the rows `claimNext` would select, without touching them.
   *
   * The predicate is deliberately identical to `claimNext`; the repository
   * test asserts both agree on the same fixture so the paused banner cannot
   * drift into counting rows the worker will not claim. Claim-time suppression
   * is decided per row after this query, so the count is an upper bound.
   */
  async summarizeClaimable(
    input: SummarizeClaimableDeliveriesInput = {},
  ): Promise<SummarizeClaimableDeliveriesResult> {
    const now = input.now ?? this.context.now();
    const row = await this.context.db
      .selectFrom("deliveries")
      .innerJoin("destinations", "destinations.id", "deliveries.destination_id")
      .leftJoin("routes", "routes.id", "deliveries.route_id")
      .select((eb) => [
        eb.fn.count<number>("deliveries.id").as("claimable"),
        eb.fn.min("deliveries.created_at").as("oldest_created_at"),
      ])
      .where("deliveries.state", "=", "pending")
      .where("destinations.enabled", "=", 1)
      .where((eb) => eb.or([eb("deliveries.route_id", "is", null), eb("routes.enabled", "=", 1)]))
      .where((eb) =>
        eb.or([
          eb("deliveries.next_attempt_at", "is", null),
          eb("deliveries.next_attempt_at", "<=", now),
        ]),
      )
      .whereRef("deliveries.attempt_count", "<", "deliveries.max_attempts")
      .executeTakeFirst();

    return {
      claimable: Number(row?.claimable ?? 0),
      oldestCreatedAt: row?.oldest_created_at ?? null,
    };
  }

  markSucceeded(input: MarkDeliverySucceededInput): Promise<DeliveryJob> {
    return this.context.runInTransaction(async (context) => {
      const repository = this.withContext(context);
      const finishedAt = input.finishedAt ?? this.context.now();

      await context.db
        .updateTable("delivery_attempts")
        .set({
          state: "succeeded",
          response_status: input.responseStatus ?? null,
          response_body: redactNullableText(input.responseBody),
          error: null,
          ...(input.startedAt === undefined ? {} : { started_at: input.startedAt }),
          finished_at: finishedAt,
        })
        .where("id", "=", input.attemptId)
        .where("delivery_id", "=", input.deliveryId)
        .execute();

      await context.db
        .updateTable("deliveries")
        .set((eb) => ({
          state: "succeeded",
          next_attempt_at: null,
          last_error: null,
          rendered_payload_json:
            input.renderedPayload === undefined
              ? eb.ref("rendered_payload_json")
              : encodeJson(input.renderedPayload),
          provider_ref_type: input.providerReference?.type ?? null,
          provider_ref_value: input.providerReference?.value ?? null,
          updated_at: finishedAt,
          finished_at: finishedAt,
        }))
        .where("id", "=", input.deliveryId)
        .execute();

      return requireDelivery(await repository.getJob(input.deliveryId));
    });
  }

  markFailed(input: MarkDeliveryFailedInput): Promise<DeliveryJob> {
    return this.context.runInTransaction(async (context) => {
      const repository = this.withContext(context);
      const finishedAt = input.finishedAt ?? this.context.now();
      const current = requireDelivery(await repository.getJob(input.deliveryId));
      const shouldRetry = input.retryAt !== null && current.attemptCount < current.maxAttempts;
      const nextState = shouldRetry ? "pending" : "failed";
      const nextAttemptAt = shouldRetry ? input.retryAt : null;
      const finishedDeliveryAt = shouldRetry ? null : finishedAt;

      await context.db
        .updateTable("delivery_attempts")
        .set({
          state: "failed",
          response_status: input.responseStatus ?? null,
          response_body: redactNullableText(input.responseBody),
          error: redactText(input.error),
          ...(input.startedAt === undefined ? {} : { started_at: input.startedAt }),
          finished_at: finishedAt,
        })
        .where("id", "=", input.attemptId)
        .where("delivery_id", "=", input.deliveryId)
        .execute();

      await context.db
        .updateTable("deliveries")
        .set({
          state: nextState,
          next_attempt_at: nextAttemptAt,
          last_error: redactText(input.error),
          updated_at: finishedAt,
          finished_at: finishedDeliveryAt,
        })
        .where("id", "=", input.deliveryId)
        .execute();

      return requireDelivery(await repository.getJob(input.deliveryId));
    });
  }

  retryNow(input: RetryDeliveryInput): Promise<DeliveryJob> {
    return this.context.runInTransaction(async (context) => {
      const repository = this.withContext(context);
      const requestedAt = input.requestedAt ?? this.context.now();
      const current = requireDelivery(await repository.getJob(input.deliveryId));

      if (current.state !== "failed") {
        throw new InvalidDeliveryStateError(input.deliveryId, current.state, "retry");
      }

      // The state is `failed` only because the success write failed twice; the
      // destination already accepted the alert. Re-queuing it would page
      // on-call a second time, so refuse before touching the row.
      if (isDeliveryAcceptedUnrecorded(current.lastError)) {
        throw new DeliveryAlreadyAcceptedError(input.deliveryId);
      }

      await context.db
        .updateTable("deliveries")
        .set({
          state: "pending",
          max_attempts: sql<number>`
            CASE
              WHEN max_attempts <= attempt_count THEN attempt_count + 1
              ELSE max_attempts
            END
          `,
          next_attempt_at: requestedAt,
          last_error: null,
          updated_at: requestedAt,
          finished_at: null,
        })
        .where("id", "=", input.deliveryId)
        .execute();

      return requireDelivery(await repository.getJob(input.deliveryId));
    });
  }

  async get(id: string): Promise<DeliveryDetail | null> {
    const job = await this.getJob(id);

    if (!job) {
      return null;
    }

    const event = requireEvent(await this.intake.get(job.eventId));
    const source = sourceSummaryFromRuntime(requireSource(await this.sources.get(event.sourceId)));
    const destinationRuntime = requireDestination(await this.destinations.get(job.destinationId));
    const destination = destinationSummaryFromRuntime(destinationRuntime);
    // The metadata below is projected at read time, so pair it with the
    // target's last write; the UI warns when that is later than this delivery.
    const destinationUpdatedAt = await this.destinationUpdatedAt(job.destinationId, job.createdAt);
    const destinationMetadata = destinationMetadataFromRuntime(destinationRuntime);
    const route = job.routeId ? await this.routes.get(job.routeId) : null;
    const attempts = (
      await this.context.db
        .selectFrom("delivery_attempts")
        .selectAll()
        .where("delivery_id", "=", job.id)
        .orderBy("attempt_number")
        .execute()
    ).map((row) => attemptFromRow(row));
    const row = await this.context.db
      .selectFrom("deliveries")
      .select(["rendered_payload_json", "provider_ref_type", "provider_ref_value"])
      .where("id", "=", id)
      .executeTakeFirst();

    return {
      job,
      // The detail DTO redacts provider-authored copy; the worker's claim path
      // still reads the raw event above for its own decisions.
      event: redactEventRecord(event),
      rawPayloadPruned: isPrunedRawPayload(event.rawPayload),
      source,
      destination,
      destinationUpdatedAt,
      destinationMetadata,
      route,
      renderedPayload: row ? decodeRenderedPayload(row.rendered_payload_json) : null,
      providerReference: row ? providerReferenceFromRow(row) : null,
      attempts,
      pings: await this.oncall.listForDelivery(job.id),
    };
  }

  /**
   * Last write to the target's stored config, read alongside the detail.
   *
   * `DestinationRuntimeConfig` carries no timestamps and the detail needs this
   * one fact only, so it is read as a projected column instead of widening the
   * shared runtime type. When the row is gone (deleted between the two reads)
   * the enqueue time is returned, which suppresses the notice rather than
   * raising a false "changed" warning.
   */
  private async destinationUpdatedAt(
    destinationId: string,
    fallback: IsoDateTimeString,
  ): Promise<IsoDateTimeString> {
    const row = await this.context.db
      .selectFrom("destinations")
      .select("updated_at")
      .where("id", "=", destinationId)
      .executeTakeFirst();

    return row?.updated_at ?? fallback;
  }

  async getJob(id: string): Promise<DeliveryJob | null> {
    const row = await this.context.db
      .selectFrom("deliveries")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? deliveryFromRow(row) : null;
  }

  async getAttempt(id: string): Promise<DeliveryAttempt | null> {
    const row = await this.context.db
      .selectFrom("delivery_attempts")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? attemptFromRow(row) : null;
  }

  private withContext(context: SqliteRepositoryContext): SqliteDeliveryRepository {
    const sources = new SqliteSourceRepository(context);
    const destinations = new SqliteDestinationRepository(context);
    const routes = new SqliteRouteRepository(context);
    const suppressions = new SqliteSuppressionRepository(context);
    const intake = new SqliteIntakeRepositoryImpl(context);
    const oncall = new SqliteOncallRepository(context, destinations, intake);

    return new SqliteDeliveryRepository(
      context,
      sources,
      destinations,
      routes,
      suppressions,
      intake,
      oncall,
    );
  }
}

/**
 * Decide whether one `(event, destination)` delivery is silenced by any of the
 * given rules, using the shared core matcher and the same `startsAt`/`id`
 * ordering as the domain model. Returns the rule itself (not just the result)
 * so callers can snapshot its name and kind into `suppress_reason`.
 */
function selectDeliverySuppression(
  suppressions: Suppression[],
  input: SuppressionMatchInput,
  now: string,
): Suppression | null {
  const result = selectSuppressionForDelivery(suppressions, input, now);

  if (!result) {
    return null;
  }

  return suppressions.find((candidate) => candidate.id === result.suppressionId) ?? null;
}

async function listExistingTargetsForEvent(
  context: SqliteRepositoryContext,
  eventId: string,
): Promise<Map<string, ExistingDeliveryTarget>> {
  const rows = await context.db
    .selectFrom("deliveries")
    .select(["id", "event_id", "route_id", "destination_id", "state"])
    .where("event_id", "=", eventId)
    .where("route_id", "is not", null)
    .execute();

  return new Map(
    rows
      .filter((row): row is typeof row & { route_id: string } => row.route_id !== null)
      .map((row) => [
        deliveryTargetKey(row.route_id, row.destination_id),
        {
          deliveryId: row.id,
          eventId: row.event_id,
          routeId: row.route_id,
          destinationId: row.destination_id,
          state: row.state,
        },
      ]),
  );
}

function deliveryTargetKey(routeId: string, destinationId: string): string {
  return `${routeId}\u0000${destinationId}`;
}
