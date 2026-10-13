import {
  encodeJson,
  encodeJsonObject,
  encodeSchemaJson,
  JsonObjectSchema,
  RouteMatchResultsSchema,
} from "@tocsin/core";
import type { EventRecord } from "@tocsin/core";

import type { SqliteRepositoryContext } from "#/infra/sqlite/context";
import {
  eventFromRow,
  PRUNED_RAW_PAYLOAD,
  RAW_PAYLOAD_PRUNE_BATCH_SIZE,
  requireEvent,
} from "#/infra/sqlite/repositories/intake/intake.helpers";
import type {
  IntakeRepository,
  ListRecentEventsInput,
  PruneRawPayloadsInput,
  RecordEventInput,
} from "#/infra/sqlite/repositories/intake/intake.interface";

export class SqliteIntakeRepository implements IntakeRepository {
  constructor(private readonly context: SqliteRepositoryContext) {}

  async recordEvent(input: RecordEventInput): Promise<EventRecord> {
    const now = this.context.now();
    const id = input.id ?? this.context.ids.event();
    const receivedAt = input.receivedAt ?? now;
    const createdAt = input.createdAt ?? receivedAt;
    const normalized = input.normalized;
    const providerMetadata = JsonObjectSchema.parse(input.providerMetadata ?? {});
    const rawHeaders = JsonObjectSchema.parse(input.rawHeaders ?? {});
    const routeMatches = input.routeMatches
      ? RouteMatchResultsSchema.parse(input.routeMatches)
      : null;

    await this.context.db
      .insertInto("events")
      .values({
        id,
        source_id: input.sourceId,
        idempotency_key: input.idempotencyKey,
        fingerprint: normalized.fingerprint,
        severity: normalized.severity,
        status: normalized.status,
        title: normalized.title,
        message: normalized.message,
        labels_json: encodeJsonObject(normalized.labels),
        normalized_json: encodeJson(normalized),
        provider_metadata_json: encodeJsonObject(providerMetadata),
        raw_payload_json: encodeJson(input.rawPayload),
        raw_headers_json: encodeJsonObject(rawHeaders),
        route_matches_json:
          routeMatches === null ? null : encodeSchemaJson(RouteMatchResultsSchema, routeMatches),
        received_at: receivedAt,
        occurred_at: normalized.occurredAt,
        created_at: createdAt,
      })
      .execute();

    return requireEvent(await this.get(id));
  }

  async get(id: string): Promise<EventRecord | null> {
    const row = await this.context.db
      .selectFrom("events")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? eventFromRow(row) : null;
  }

  async listRecent(input: ListRecentEventsInput = {}): Promise<EventRecord[]> {
    const limit = Math.max(input.limit ?? 20, 1);
    const rows = await this.context.db
      .selectFrom("events")
      .selectAll()
      .orderBy("received_at", "desc")
      .orderBy("id", "desc")
      .limit(limit)
      .execute();

    return rows.map((row) => eventFromRow(row));
  }

  /**
   * Redact raw payloads older than the retention cutoff.
   *
   * Bounded on purpose. This runs on the ingest request path (once per accepted
   * webhook), so an unbounded `UPDATE ... WHERE received_at < cutoff` grows with
   * the backlog: after a first deploy against a database with a year of history,
   * or any period where ingestion outpaced pruning, every single webhook pays for
   * the whole backlog. A bounded batch keeps the per-request cost constant and
   * still converges — the next webhook prunes the next batch, and the post-ingest
   * sweep (see `pruneAllRawPayloads`) finishes anything a quiet period leaves
   * behind. Operators see the same retention behaviour; only the work is moved.
   *
   * The selected ids make this an index-driven scan rather than a full table
   * update: `events.id` is the primary key, so the follow-up update touches only
   * the batch.
   */
  async pruneRawPayloads(input: PruneRawPayloadsInput): Promise<number> {
    const prunedPayload = encodeJson(PRUNED_RAW_PAYLOAD);
    const stale = await this.context.db
      .selectFrom("events")
      .select("id")
      .where("received_at", "<", input.before)
      .where("raw_payload_json", "!=", prunedPayload)
      .orderBy("received_at", "asc")
      .limit(input.limit ?? RAW_PAYLOAD_PRUNE_BATCH_SIZE)
      .execute();

    if (stale.length === 0) {
      return 0;
    }

    const result = await this.context.db
      .updateTable("events")
      .set({
        raw_payload_json: prunedPayload,
        raw_headers_json: encodeJsonObject({}),
      })
      .where(
        "id",
        "in",
        stale.map((row) => row.id),
      )
      .executeTakeFirst();

    return Number(result.numUpdatedRows);
  }

  /**
   * Drain every stale raw payload, ignoring the ingest batch bound.
   *
   * For offline maintenance (a one-shot over an existing database) and for the
   * post-ingest sweep, which finishes the backlog once the response is no longer
   * waiting on it. Callers must not put this on a request path.
   */
  async pruneAllRawPayloads(input: PruneRawPayloadsInput): Promise<number> {
    const prunedPayload = encodeJson(PRUNED_RAW_PAYLOAD);
    const result = await this.context.db
      .updateTable("events")
      .set({
        raw_payload_json: prunedPayload,
        raw_headers_json: encodeJsonObject({}),
      })
      .where("received_at", "<", input.before)
      .where("raw_payload_json", "!=", prunedPayload)
      .executeTakeFirst();

    return Number(result.numUpdatedRows);
  }
}
