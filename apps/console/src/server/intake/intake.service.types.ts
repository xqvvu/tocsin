import type { JsonValue, RouteMatchResult } from "@tocsin/core";
import type { ProviderRegistry } from "@tocsin/providers";

import type { SqliteStore } from "#/infra/sqlite/store";

/**
 * Process-wide latch for the background raw-payload sweep.
 *
 * The intake service is created per request, so a single-flight flag on the
 * instance never sees the other requests: concurrent webhooks would each start
 * their own full-table drain. The container owns one gate and hands it to every
 * instance it builds.
 */
export interface RawPayloadSweepGate {
  /** Returns true when the caller now owns the sweep. */
  tryAcquire(): boolean;
  release(): void;
}

export interface WebhookIntakeServiceOptions {
  store: SqliteStore;
  providers: ProviderRegistry;
  now?: () => string;
  dedupeWindowMs?: number;
  sweepGate?: RawPayloadSweepGate;
}

export interface AcceptWebhookInput {
  sourceId: string;
  token?: string | null;
  headers: Record<string, string>;
  payload: unknown;
  receivedAt?: string;
}

export interface AcceptedWebhook {
  accepted: true;
  eventId: string;
  createdDeliveryIds: string[];
  dedupedDeliveryCount: number;
  matchedRoutes: RouteMatchResult[];
}

export type WebhookIntakeFailureReason =
  | "source_not_found"
  | "source_disabled"
  | "invalid_token"
  | "provider_parse_failed";

export interface WebhookIntakeErrorOptions extends ErrorOptions {
  eventId?: string;
}

export interface ParserFailureRecordInput {
  sourceId: string;
  sourceProvider: string;
  payload: JsonValue;
  rawPayload: JsonValue;
  rawHeaders: Record<string, string>;
  receivedAt: string;
  error: unknown;
}
