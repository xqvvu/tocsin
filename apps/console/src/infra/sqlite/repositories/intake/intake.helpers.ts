import {
  decodeJson,
  decodeJsonObject,
  decodeSchemaJson,
  EventRecordSchema,
  NormalizedEventSchema,
  RouteMatchResultsSchema,
} from "@tocsin/core";
import type { EventRecord, NormalizedEvent } from "@tocsin/core";

import { RecordNotFoundError } from "#/infra/sqlite/errors";
import type { EventRow } from "#/infra/sqlite/repositories/intake/intake.interface";

/**
 * The placeholder `0003_complete_legacy_schema` writes into `normalized_json`
 * when it repairs a database that predates the column. A valid normalized
 * event always carries a title, fingerprint, severity, status and occurredAt,
 * so it can never serialize to `{}`; the exact value therefore identifies the
 * repair placeholder rather than provider data.
 */
const LEGACY_NORMALIZED_JSON = "{}";

/**
 * How many stale events one ingest request may redact.
 *
 * Ingest prunes raw payloads inline; an unbounded prune makes every webhook pay
 * for the entire backlog, so this bounds the work per request. The post-ingest
 * sweep and the offline `pruneAllRawPayloads` finish the rest.
 */
export const RAW_PAYLOAD_PRUNE_BATCH_SIZE = 100;

export const PRUNED_RAW_PAYLOAD = {
  retentionPruned: true,
};

/**
 * Whether a stored raw payload is the retention prune sentinel rather than
 * provider data. Callers that read the event back (for example the detail
 * projection) use this to expose an explicit "pruned" state, because rendering
 * the sentinel itself would look like a payload the upstream actually sent.
 *
 * The match is deliberately exact: a real payload that merely carries a
 * `retentionPruned` key alongside other fields is still provider data.
 */
export function isPrunedRawPayload(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const entries = Object.entries(value);

  return entries.length === 1 && entries[0][0] === "retentionPruned" && entries[0][1] === true;
}

export function eventFromRow(row: EventRow): EventRecord {
  return EventRecordSchema.parse({
    id: row.id,
    sourceId: row.source_id,
    idempotencyKey: row.idempotency_key,
    normalized: decodeNormalizedEvent(row),
    providerMetadata: decodeJsonObject(row.provider_metadata_json),
    rawPayload: decodeJson(row.raw_payload_json),
    rawHeaders: decodeRawHeaders(row.raw_headers_json),
    routeMatches:
      row.route_matches_json === null
        ? null
        : decodeSchemaJson(RouteMatchResultsSchema, row.route_matches_json),
    receivedAt: row.received_at,
  });
}

/**
 * Rebuild the normalized event for rows the 0003 repair migration touched.
 *
 * `0003` adds `normalized_json` with `DEFAULT '{}'`, so every event that
 * predates the column keeps an empty object. Parsing that value directly used
 * to throw, which broke historical event and delivery detail pages and — worse
 * — poisoned the delivery batch: `claimNext` parses the event inside its
 * transaction, so one legacy pending row aborted the whole batch on every
 * worker tick and starved new alerts. The denormalized columns were written
 * from the same normalized object on ingest, so they are a faithful source for
 * reconstruction; no write or backfill migration is needed.
 *
 * Only the exact empty object is treated as the placeholder. Any other
 * unparsable value still throws, so real corruption stays visible.
 */
function decodeNormalizedEvent(row: EventRow): NormalizedEvent {
  if (row.normalized_json !== LEGACY_NORMALIZED_JSON) {
    return decodeSchemaJson(NormalizedEventSchema, row.normalized_json);
  }

  return NormalizedEventSchema.parse({
    title: row.title,
    message: row.message,
    severity: row.severity,
    status: row.status,
    fingerprint: row.fingerprint,
    labels: decodeJsonObject(row.labels_json),
    occurredAt: row.occurred_at,
  });
}

export function requireEvent(event: EventRecord | null): EventRecord {
  if (!event) {
    throw new RecordNotFoundError("Event");
  }

  return event;
}

function decodeRawHeaders(value: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(decodeJsonObject(value)).map(([key, entry]) => [
      key,
      typeof entry === "string" ? entry : JSON.stringify(entry),
    ]),
  );
}
