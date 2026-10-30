import {
  AdapterCatalogBaseSchema,
  AdapterConfigFieldSchema,
  AdapterConfigVersionSchema,
  AdapterLifecycleSchema,
  AdapterSecretFieldSchema,
  DestinationKindSchema,
} from "@tocsin/core";
import type {
  DestinationKind,
  DestinationSummary,
  JsonValue,
  NormalizedEvent,
  ProviderReference,
  SourceSummary,
} from "@tocsin/core";
import type { Locale } from "@tocsin/core/presentation";
import { z } from "zod";

export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<FetchLikeResponse>;

export interface DestinationPresentation {
  locale: Locale;
  timeZone: string;
}

export interface DestinationRenderInput<Config> {
  eventId: string;
  /**
   * Absolute dashboard link for this Event, filled by rendering sites from the
   * deployment's public URL. The template renders an empty string when it is
   * absent, which is also the behavior for samples with no stored Event.
   */
  eventUrl?: string;
  /**
   * Absolute dashboard link for the delivery being sent, filled by the worker
   * from the deployment's public URL. Absent for previews and test sends,
   * because neither has a persisted delivery to link to; the template renders
   * an empty string in that case.
   */
  deliveryUrl?: string;
  /**
   * Group size reported by the upstream provider for this Event, filled by the
   * rendering site from `providerMetadata.alertCount`. Group-based providers
   * collapse a whole notification group into the first alert, so a template
   * that says "5 alerts" cannot be written without it. Absent when the
   * provider reports no count; the template renders an empty string.
   */
  alertCount?: number;
  source: SourceSummary;
  destination: DestinationSummary;
  normalizedEvent: NormalizedEvent;
  payload?: JsonValue;
  config: Config;
  presentation?: DestinationPresentation;
}

export interface DestinationTransportContext {
  fetch?: FetchLike;
  now?: () => Date;
  /** Per-request deadline in milliseconds; `0` disables it. Defaults to 10s. */
  timeoutMs?: number;
}

export type DestinationSendContext = DestinationTransportContext;
export type DestinationSendInput<Config> = DestinationRenderInput<Config>;

export type DestinationErrorKind =
  | "http_error"
  | "target_rejected"
  | "network_error"
  | "timeout"
  | "configuration_error"
  | "unknown_error";

export type DestinationRetryHint = "retryable" | "not_retryable" | "unknown";

export interface DestinationSendResultBase {
  statusCode: number | null;
  responseBody: string | null;
  renderedPayload: JsonValue;
  /** 目标系统返回的资产句柄；adapter 拿不到时可省略。 */
  providerReference?: ProviderReference;
}

export type DestinationSendResult =
  | (DestinationSendResultBase & {
      ok: true;
    })
  | (DestinationSendResultBase & {
      ok: false;
      errorKind: DestinationErrorKind;
      retryHint: DestinationRetryHint;
      errorMessage: string;
    });

export const DestinationCapabilitiesSchema = z.strictObject({
  preview: z.boolean(),
  test: z.boolean(),
  delivery: z.boolean(),
});
export type DestinationCapabilities = z.output<typeof DestinationCapabilitiesSchema>;

export const DestinationManifestSchema = z.strictObject({
  kind: DestinationKindSchema,
  configVersion: AdapterConfigVersionSchema,
  lifecycle: AdapterLifecycleSchema,
  displayNameKey: z.string().trim().min(1),
  descriptionKey: z.string().trim().min(1).optional(),
  iconName: z.string().trim().min(1).optional(),
  configFields: z.array(AdapterConfigFieldSchema),
  secretFields: z.array(AdapterSecretFieldSchema),
  capabilities: DestinationCapabilitiesSchema,
});
export type DestinationManifest<Kind extends DestinationKind = DestinationKind> = Omit<
  z.output<typeof DestinationManifestSchema>,
  "kind"
> & {
  kind: Kind;
};

export const DestinationCatalogItemSchema = AdapterCatalogBaseSchema.extend({
  kind: DestinationKindSchema,
  capabilities: DestinationCapabilitiesSchema,
});
export type DestinationCatalogItem = z.output<typeof DestinationCatalogItemSchema>;

export interface DestinationAdapter<
  Kind extends DestinationKind = DestinationKind,
  Config = unknown,
> {
  manifest: DestinationManifest<Kind>;
  configSchema: z.ZodType<Config>;
  preview(input: DestinationRenderInput<Config>): Promise<JsonValue> | JsonValue;
  send(
    input: DestinationRenderInput<Config>,
    context?: DestinationTransportContext,
  ): Promise<DestinationSendResult>;
}

export type DestinationSender<Config = unknown> = DestinationAdapter<DestinationKind, Config>;

export type DestinationAdapterDefinition<
  Kind extends DestinationKind,
  Schema extends z.ZodType,
> = Omit<DestinationAdapter<Kind, z.output<Schema>>, "configSchema"> & {
  configSchema: Schema;
};
