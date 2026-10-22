import { sql } from "kysely";

import type { IsoDateTimeString, OncallPing } from "@tocsin/core";

import { RecordNotFoundError } from "#/infra/sqlite/errors";
import {
  providerReferenceFromRow,
  redactNullableText,
} from "#/infra/sqlite/repositories/delivery/delivery.helpers";
import type {
  OncallPingDedupeKeyRow,
  OncallPingRow,
} from "#/infra/sqlite/repositories/oncall/oncall.interface";
import type { SqliteExecutor } from "#/infra/sqlite/schema";

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
    // Legacy rows may predate value-shape redaction, so re-check on read.
    lastError: redactNullableText(row.last_error),
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

/**
 * How many stale dedupe rows one enqueue may clear.
 *
 * Mirrors `DEDUPE_PRUNE_BATCH_SIZE` on the delivery side: with the window
 * predicate in `findOncallDedupeKey`, a leftover row no longer suppresses a
 * page, so clearing it is disk hygiene that can be spread over requests.
 */
export const ONCALL_DEDUPE_PRUNE_BATCH_SIZE = 100;

export async function pruneOncallDedupeKeys(
  db: SqliteExecutor,
  startsAt: IsoDateTimeString,
): Promise<void> {
  await db
    .deleteFrom("oncall_ping_dedupe_keys")
    .where(
      sql<boolean>`rowid IN (
        SELECT rowid FROM oncall_ping_dedupe_keys
        WHERE created_at < ${startsAt}
        ORDER BY created_at, rowid
        LIMIT ${ONCALL_DEDUPE_PRUNE_BATCH_SIZE}
      )`,
    )
    .execute();
}

/** The in-window key that suppresses this page, or null when there is none. */
export async function findOncallDedupeKey(
  db: SqliteExecutor,
  row: Pick<OncallPingDedupeKeyRow, "fingerprint" | "destination_id" | "receiver">,
  windowStartsAt: IsoDateTimeString,
): Promise<OncallPingDedupeKeyRow | null> {
  const existing = await db
    .selectFrom("oncall_ping_dedupe_keys")
    .selectAll()
    .where("fingerprint", "=", row.fingerprint)
    .where("destination_id", "=", row.destination_id)
    .where("receiver", "=", row.receiver)
    .where("created_at", ">=", windowStartsAt)
    .executeTakeFirst();

  return existing ?? null;
}

/**
 * Writes the key, taking over an out-of-window leftover.
 *
 * Written after the ping row so `first_ping_id` always references something
 * that exists. `findOncallDedupeKey` only reports in-window rows, so a
 * conflict here can only be stale; refreshing it starts a new window instead
 * of failing the enqueue on a primary-key conflict.
 */
export async function saveOncallDedupeKey(
  db: SqliteExecutor,
  row: OncallPingDedupeKeyRow,
): Promise<void> {
  await db
    .insertInto("oncall_ping_dedupe_keys")
    .values(row)
    .onConflict((conflict) =>
      conflict.columns(["fingerprint", "destination_id", "receiver"]).doUpdateSet({
        first_ping_id: row.first_ping_id,
        created_at: row.created_at,
      }),
    )
    .execute();
}

export type { OncallPingDedupeKeyRow };
