import {
  AdapterCatalogBaseSchema,
  AdapterConfigFieldSchema,
  AdapterConfigVersionSchema,
  AdapterLifecycleSchema,
  AdapterSecretFieldSchema,
  SourceProviderSchema,
} from "@tocsin/core";
import type {
  JsonObject,
  JsonValue,
  NormalizedEvent,
  SourceProvider,
  SourceSummary,
} from "@tocsin/core";
import { z } from "zod";

export interface ProviderParseInput<Config = unknown> {
  source: SourceSummary;
  sourceId: string;
  sourceName: string;
  receivedAt: string;
  headers: Record<string, string>;
  payload: JsonValue;
  config: Config;
}

export type ProviderStandaloneParseInput<Config = unknown> = Omit<
  ProviderParseInput<Config>,
  "source" | "config"
> & {
  source?: SourceSummary;
  config?: Config;
};

export interface ProviderParseSuccess {
  ok: true;
  normalized: NormalizedEvent;
  providerMetadata: JsonObject;
  idempotencyKey: string;
}

export type ProviderParseFailureReason =
  | "invalid_payload"
  | "unsupported_payload"
  | "configuration_error"
  | "unknown_error";

export interface ProviderParseFailure {
  ok: false;
  reason: ProviderParseFailureReason;
  message: string;
  providerMetadata?: JsonObject;
}

export type ProviderParseResult = ProviderParseSuccess | ProviderParseFailure;

export type ProviderParseOutput = Omit<ProviderParseSuccess, "ok">;

export const ProviderCapabilitiesSchema = z.strictObject({
  parse: z.boolean(),
  testPayload: z.boolean(),
  sourceToken: z.boolean(),
  additionalSharedSecret: z.boolean(),
});
export type ProviderCapabilities = z.output<typeof ProviderCapabilitiesSchema>;

export const ProviderManifestSchema = z.strictObject({
  provider: SourceProviderSchema,
  configVersion: AdapterConfigVersionSchema,
  lifecycle: AdapterLifecycleSchema,
  displayNameKey: z.string().trim().min(1),
  descriptionKey: z.string().trim().min(1).optional(),
  iconName: z.string().trim().min(1).optional(),
  configFields: z.array(AdapterConfigFieldSchema),
  secretFields: z.array(AdapterSecretFieldSchema),
  capabilities: ProviderCapabilitiesSchema,
});
export type ProviderManifest<Provider extends SourceProvider = SourceProvider> = Omit<
  z.output<typeof ProviderManifestSchema>,
  "provider"
> & {
  provider: Provider;
};

export const ProviderCatalogItemSchema = AdapterCatalogBaseSchema.extend({
  provider: SourceProviderSchema,
  capabilities: ProviderCapabilitiesSchema,
});
export type ProviderCatalogItem = z.output<typeof ProviderCatalogItemSchema>;

export interface ProviderAdapter<
  Provider extends SourceProvider = SourceProvider,
  Config = unknown,
> {
  manifest: ProviderManifest<Provider>;
  configSchema: z.ZodType<Config>;
  parse(input: ProviderParseInput<Config>): ProviderParseResult;
}

export type ProviderParser<Config = unknown> = ProviderAdapter<SourceProvider, Config>;

export type ProviderAdapterDefinition<
  Provider extends SourceProvider,
  Schema extends z.ZodType,
> = Omit<ProviderAdapter<Provider, z.output<Schema>>, "configSchema"> & {
  configSchema: Schema;
};
