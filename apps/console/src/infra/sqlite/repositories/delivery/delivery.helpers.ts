import { decodeJson, DeliveryJobSchema, redactText } from "@tocsin/core";
import type { DeliveryAttempt, DeliveryJob, JsonValue, ProviderReference } from "@tocsin/core";

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
    lastError: row.last_error,
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
    responseBody: row.response_body,
    error: row.error,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export function decodeRenderedPayload(value: string | null): JsonValue | null {
  return value === null ? null : decodeJson(value);
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

export async function reserveDedupeKey(
  db: SqliteExecutor,
  row: DeliveryDedupeKeyRow,
): Promise<DeliveryDedupeKeyRow | null> {
  const existing = await db
    .selectFrom("delivery_dedupe_keys")
    .selectAll()
    .where("source_id", "=", row.source_id)
    .where("idempotency_key", "=", row.idempotency_key)
    .where("route_id", "=", row.route_id)
    .where("destination_id", "=", row.destination_id)
    .executeTakeFirst();

  if (existing) {
    return existing;
  }

  await db.insertInto("delivery_dedupe_keys").values(row).execute();

  return null;
}

export async function pruneDedupeKeys(db: SqliteExecutor, startsAt: string): Promise<void> {
  await db.deleteFrom("delivery_dedupe_keys").where("created_at", "<", startsAt).execute();
}

export function redactNullableText(value: string | null | undefined): string | null {
  return value === null || value === undefined ? null : redactText(value);
}
