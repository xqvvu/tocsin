import type { OncallPing } from "@tocsin/core";

import { RecordNotFoundError } from "#/infra/sqlite/errors";
import { providerReferenceFromRow } from "#/infra/sqlite/repositories/delivery/delivery.helpers";
import type {
  OncallPingDedupeKeyRow,
  OncallPingRow,
} from "#/infra/sqlite/repositories/oncall/oncall.interface";

export function oncallPingFromRow(row: OncallPingRow): OncallPing {
  return {
    id: row.id,
    deliveryId: row.delivery_id,
    destinationId: row.destination_id,
    eventId: row.event_id,
    receiver: row.receiver,
    channel: row.channel,
    state: row.state,
    trigger: row.trigger,
    initiatedBy: row.initiated_by,
    providerReference: providerReferenceFromRow(row),
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    firedAt: row.fired_at,
  };
}

export function requireOncallPing(ping: OncallPing | null): OncallPing {
  if (!ping) {
    throw new RecordNotFoundError("Oncall ping");
  }

  return ping;
}

export type { OncallPingDedupeKeyRow };
