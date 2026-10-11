import type { JsonValue, RouteMatchResult } from "@tocsin/core";
import type { ProviderRegistry } from "@tocsin/providers";

import type { SqliteStore } from "#/infra/sqlite/store";

export interface WebhookIntakeServiceOptions {
  store: SqliteStore;
  providers: ProviderRegistry;
  now?: () => string;
  dedupeWindowMs?: number;
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
