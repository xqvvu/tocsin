import type {
  EventRecord,
  JsonObject,
  JsonValue,
  NormalizedEvent,
  RouteMatchResult,
} from "@tocsin/core";
import type { IsoDateTimeString } from "@tocsin/core";

import type { SqliteJsonText } from "#/infra/sqlite/codecs";

export interface EventRow {
  id: string;
  source_id: string;
  idempotency_key: string | null;
  fingerprint: string;
  severity: string;
  status: string;
  title: string;
  message: string;
  labels_json: SqliteJsonText;
  normalized_json: SqliteJsonText;
  provider_metadata_json: SqliteJsonText;
  raw_payload_json: SqliteJsonText;
  raw_headers_json: SqliteJsonText;
  route_matches_json: SqliteJsonText | null;
  received_at: IsoDateTimeString;
  occurred_at: IsoDateTimeString;
  created_at: IsoDateTimeString;
}

export interface IntakeRepository {
  recordEvent(input: RecordEventInput): Promise<EventRecord>;
  get(id: string): Promise<EventRecord | null>;
  listRecent(input?: ListRecentEventsInput): Promise<EventRecord[]>;
  pruneRawPayloads(input: PruneRawPayloadsInput): Promise<number>;
}

export interface RecordEventInput {
  id?: string;
  sourceId: string;
  idempotencyKey: string | null;
  normalized: NormalizedEvent;
  providerMetadata?: JsonObject;
  rawPayload: JsonValue;
  rawHeaders?: Record<string, string>;
  routeMatches?: RouteMatchResult[];
  receivedAt?: IsoDateTimeString;
  createdAt?: IsoDateTimeString;
}

export interface PruneRawPayloadsInput {
  before: IsoDateTimeString;
}

export interface ListRecentEventsInput {
  limit?: number;
}
