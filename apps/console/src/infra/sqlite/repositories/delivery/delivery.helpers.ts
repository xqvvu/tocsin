import { sql } from "kysely";

import { decodeJson, DeliveryJobSchema, redactJsonText, redactText } from "@tocsin/core";
import type {
  DeliveryAttempt,
  DeliveryJob,
  IsoDateTimeString,
  JsonValue,
  ProviderReference,
} from "@tocsin/core";

import { RecordNotFoundError } from "#/infra/sqlite/errors";
import type {
  DeliveryAttemptRow,
  DeliveryDedupeKeyRow,
  DeliveryRow,
} from "#/infra/sqlite/repositories/delivery/delivery.interface";
import type { SqliteExecutor } from "#/infra/sqlite/schema";

export function deliveryFromRow(row: DeliveryRow): DeliveryJob {
  return DeliveryJobSchema.parse({
    id: row.id,
    eventId: row.event_id,
    destinationId: row.destination_id,
    routeId: row.route_id,
    state: row.state,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    nextAttemptAt: row.next_attempt_at,
    // Legacy rows may predate value-shape redaction, so re-check on read.
    lastError: redactNullableText(row.last_error),
    suppressionId: row.suppression_id,
    suppressedAt: row.suppressed_at,
    suppressReason: row.suppress_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
  });
}

export function attemptFromRow(row: DeliveryAttemptRow): DeliveryAttempt {
  return {
    id: row.id,
    deliveryId: row.delivery_id,
    attemptNumber: row.attempt_number,
    state: row.state,
    responseStatus: row.response_status,
    responseBody: redactNullableText(row.response_body),
    error: redactNullableText(row.error),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

/**
 * Decodes the rendered payload for the delivery detail DTO.
 *
 * New rows were rendered from an already-redacted send input, but rows written
 * before that projection existed still carry the raw event copy; re-projecting
 * here keeps the detail page from showing credentials that an operator has
 * since rotated.
 */
export function decodeRenderedPayload(value: string | null): JsonValue | null {
  return value === null ? null : redactJsonText(decodeJson(value));
}

export function providerReferenceFromRow(
  row: Pick<DeliveryRow, "provider_ref_type" | "provider_ref_value">,
): ProviderReference | null {
  if (row.provider_ref_type === null || row.provider_ref_value === null) {
    return null;
  }

  return { type: row.provider_ref_type, value: row.provider_ref_value };
}

export function requireDelivery(delivery: DeliveryJob | null): DeliveryJob {
  if (!delivery) {
    throw new RecordNotFoundError("Delivery");
  }

  return delivery;
}

export function requireAttempt(attempt: DeliveryAttempt | null): DeliveryAttempt {
  if (!attempt) {
    throw new RecordNotFoundError("Delivery attempt");
  }

  return attempt;
}

/**
 * How many stale dedupe rows one enqueue may clear.
 *
 * With the window predicate in `reserveDedupeKey`, a leftover row no longer
 * affects correctness, only disk usage, so the prune is bounded per enqueue and
 * the backlog drains across subsequent requests instead of making one webhook
 * pay for all of it.
 */
export const DEDUPE_PRUNE_BATCH_SIZE = 100;

export async function reserveDedupeKey(
  db: SqliteExecutor,
  row: DeliveryDedupeKeyRow,
  windowStartsAt: IsoDateTimeString,
): Promise<DeliveryDedupeKeyRow | null> {
  const existing = await db
    .selectFrom("delivery_dedupe_keys")
    .selectAll()
    .where("source_id", "=", row.source_id)
    .where("idempotency_key", "=", row.idempotency_key)
    .where("route_id", "=", row.route_id)
    .where("destination_id", "=", row.destination_id)
    // Only a key created inside the window suppresses the new event. A hit
    // must return as-is: refreshing `created_at` here would turn the fixed
    // window into a sliding one, and a steady alert stream would never expire.
    .where("created_at", ">=", windowStartsAt)
    .executeTakeFirst();

  if (existing) {
    return existing;
  }

  // The primary key does not include `created_at`, and the bounded prune may
  // not have reached an out-of-window leftover yet, so a plain insert would
  // abort the whole enqueue on a primary-key conflict. The select above
  // skipped every in-window row, so the only row this can conflict with is
  // stale; taking it over is exactly "this event starts a new window".
  await db
    .insertInto("delivery_dedupe_keys")
    .values(row)
    .onConflict((conflict) =>
      conflict.columns(["source_id", "idempotency_key", "route_id", "destination_id"]).doUpdateSet({
        first_event_id: row.first_event_id,
        created_at: row.created_at,
      }),
    )
    .execute();

  return null;
}

export async function pruneDedupeKeys(
  db: SqliteExecutor,
  startsAt: IsoDateTimeString,
): Promise<void> {
  // Oldest first, one batch per enqueue. The `rowid IN (subquery)` form lets
  // SQLite stop after the batch instead of materialising every stale key.
  await db
    .deleteFrom("delivery_dedupe_keys")
    .where(
      sql<boolean>`rowid IN (
        SELECT rowid FROM delivery_dedupe_keys
        WHERE created_at < ${startsAt}
        ORDER BY created_at, rowid
        LIMIT ${DEDUPE_PRUNE_BATCH_SIZE}
      )`,
    )
    .execute();
}

export function redactNullableText(value: string | null | undefined): string | null {
  return value === null || value === undefined ? null : redactText(value);
}
