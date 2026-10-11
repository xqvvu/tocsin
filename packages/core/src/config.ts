import { z } from "zod";

import { DestinationKindSchema } from "#core/destination/destination";
import { JsonObjectSchema } from "#core/json";
import { IanaTimeZoneSchema, LocaleSchema } from "#core/presentation";
import {
  LabelMatchOperatorSchema,
  LabelMatcherSchema,
  RouteDefinitionSchema,
  RouteRuleSchema,
} from "#core/route/route";
import { SourceProviderSchema } from "#core/source/source";

export const CONFIG_SCHEMA_VERSION = "tocsin.config.v1";

const NonEmptyConfigStringSchema = z.string().trim().min(1);
const EnvironmentVariableNameSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Secret environment references must be valid env names");
const SecretPathSchema = z
  .string()
  .trim()
  .min(1)
  .regex(
    /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/,
    "Secret reference paths must use dot-separated config keys",
  )
  .refine(isSafeSecretPath, {
    message: "Secret reference paths must not use prototype-polluting keys",
  });

const UnsafeSecretPathSegments = new Set(["__proto__", "prototype", "constructor"]);

export const SecretReferenceSchema = z.strictObject({
  env: EnvironmentVariableNameSchema,
});

export const SecretReferencesSchema = z.record(SecretPathSchema, SecretReferenceSchema).default({});

export const ConfigSettingsSchema = z.strictObject({
  schemaVersion: z.literal(CONFIG_SCHEMA_VERSION),
  exportedAt: z.string().optional(),
  includeSecrets: z.literal(false),
  locale: LocaleSchema.default("en-US"),
  timeZone: IanaTimeZoneSchema.default("UTC"),
  rawPayloadRetentionDays: z.number().int().min(0).max(3650),
});

export const ConfigSourceSchema = z.strictObject({
  id: NonEmptyConfigStringSchema,
  name: NonEmptyConfigStringSchema,
  provider: SourceProviderSchema,
  enabled: z.boolean(),
  config: JsonObjectSchema.default({}),
  secretRefs: SecretReferencesSchema,
});

export const ConfigDestinationSchema = z.strictObject({
  id: NonEmptyConfigStringSchema,
  name: NonEmptyConfigStringSchema,
  kind: DestinationKindSchema,
  enabled: z.boolean(),
  config: JsonObjectSchema.default({}),
  secretRefs: SecretReferencesSchema,
});

export const ConfigRouteSchema = z.strictObject({
  id: NonEmptyConfigStringSchema,
  name: NonEmptyConfigStringSchema,
  enabled: z.boolean(),
  rule: RouteRuleSchema,
  destinationIds: RouteDefinitionSchema.shape.destinationIds,
});

export const ConfigFeishuAppSchema = z.strictObject({
  id: NonEmptyConfigStringSchema,
  name: NonEmptyConfigStringSchema,
  appId: NonEmptyConfigStringSchema,
  appSecret: z.string().min(1).optional(),
  secretRefs: SecretReferencesSchema,
});

export const ConfigurationSchema = z.strictObject({
  settings: ConfigSettingsSchema,
  feishuApps: z.array(ConfigFeishuAppSchema).default([]),
  sources: z.array(ConfigSourceSchema).default([]),
  destinations: z.array(ConfigDestinationSchema).default([]),
  routes: z.array(ConfigRouteSchema).default([]),
});

const TomlLabelMatcherSchema = z.strictObject({
  key: NonEmptyConfigStringSchema,
  operator: LabelMatchOperatorSchema.default("equals"),
  value: NonEmptyConfigStringSchema,
});

const TomlRouteRuleSchema = z.strictObject({
  source_ids: z.array(NonEmptyConfigStringSchema).default([]),
  severities: RouteRuleSchema.shape.severities.default([]),
  statuses: RouteRuleSchema.shape.statuses.default([]),
  labels: z.array(TomlLabelMatcherSchema).default([]),
  title_contains: z.array(NonEmptyConfigStringSchema).default([]),
  message_contains: z.array(NonEmptyConfigStringSchema).default([]),
});

const EmptyTomlRouteRule = {
  source_ids: [],
  severities: [],
  statuses: [],
  labels: [],
  title_contains: [],
  message_contains: [],
} satisfies z.output<typeof TomlRouteRuleSchema>;

export const TomlSettingsDocumentSchema = z.strictObject({
  schema_version: z.literal(CONFIG_SCHEMA_VERSION),
  exported_at: z.string().optional(),
  include_secrets: z.literal(false),
  locale: LocaleSchema.default("en-US"),
  time_zone: IanaTimeZoneSchema.default("UTC"),
  raw_payload_retention_days: z.number().int().min(0).max(3650),
});

export const TomlSourceDocumentSchema = z.strictObject({
  id: NonEmptyConfigStringSchema,
  name: NonEmptyConfigStringSchema,
  provider: SourceProviderSchema,
  enabled: z.boolean(),
  config: JsonObjectSchema.default({}),
  secret_refs: SecretReferencesSchema,
});

export const TomlDestinationDocumentSchema = z.strictObject({
  id: NonEmptyConfigStringSchema,
  name: NonEmptyConfigStringSchema,
  kind: DestinationKindSchema,
  enabled: z.boolean(),
  config: JsonObjectSchema.default({}),
  secret_refs: SecretReferencesSchema,
});

export const TomlRouteDocumentSchema = z.strictObject({
  id: NonEmptyConfigStringSchema,
  name: NonEmptyConfigStringSchema,
  enabled: z.boolean(),
  rule: TomlRouteRuleSchema.default(EmptyTomlRouteRule),
  destination_ids: RouteDefinitionSchema.shape.destinationIds,
});

export const TomlFeishuAppDocumentSchema = z.strictObject({
  id: NonEmptyConfigStringSchema,
  name: NonEmptyConfigStringSchema,
  app_id: NonEmptyConfigStringSchema,
  app_secret: z.string().min(1).optional(),
  secret_refs: SecretReferencesSchema,
});

export const TomlDocumentSchema = z.strictObject({
  settings: TomlSettingsDocumentSchema,
  feishu_apps: z.array(TomlFeishuAppDocumentSchema).default([]),
  sources: z.array(TomlSourceDocumentSchema).default([]),
  destinations: z.array(TomlDestinationDocumentSchema).default([]),
  routes: z.array(TomlRouteDocumentSchema).default([]),
});

export type SecretReference = z.infer<typeof SecretReferenceSchema>;
export type SecretReferences = z.infer<typeof SecretReferencesSchema>;
export type ConfigSettings = z.infer<typeof ConfigSettingsSchema>;
export type ConfigFeishuApp = z.infer<typeof ConfigFeishuAppSchema>;
export type ConfigSource = z.infer<typeof ConfigSourceSchema>;
export type ConfigDestination = z.infer<typeof ConfigDestinationSchema>;
export type ConfigRoute = z.infer<typeof ConfigRouteSchema>;
export type Configuration = z.infer<typeof ConfigurationSchema>;
export type TomlDocument = z.infer<typeof TomlDocumentSchema>;

export function isSafeSecretPath(path: string): boolean {
  return path
    .split(".")
    .every((segment) => segment.length > 0 && !UnsafeSecretPathSegments.has(segment));
}

export function configurationToTomlDocument(configInput: Configuration): TomlDocument {
  const config = ConfigurationSchema.parse(configInput);

  return TomlDocumentSchema.parse({
    settings: {
      schema_version: config.settings.schemaVersion,
      exported_at: config.settings.exportedAt,
      include_secrets: config.settings.includeSecrets,
      locale: config.settings.locale,
      time_zone: config.settings.timeZone,
      raw_payload_retention_days: config.settings.rawPayloadRetentionDays,
    },
    feishu_apps: config.feishuApps.map((app) => ({
      id: app.id,
      name: app.name,
      app_id: app.appId,
      app_secret: app.appSecret,
      secret_refs: app.secretRefs,
    })),
    sources: config.sources.map((source) => ({
      id: source.id,
      name: source.name,
      provider: source.provider,
      enabled: source.enabled,
      config: source.config,
      secret_refs: source.secretRefs,
    })),
    destinations: config.destinations.map((destination) => ({
      id: destination.id,
      name: destination.name,
      kind: destination.kind,
      enabled: destination.enabled,
      config: destination.config,
      secret_refs: destination.secretRefs,
    })),
    routes: config.routes.map((route) => ({
      id: route.id,
      name: route.name,
      enabled: route.enabled,
      rule: {
        source_ids: route.rule.sourceIds,
        severities: route.rule.severities,
        statuses: route.rule.statuses,
        labels: route.rule.labels,
        title_contains: route.rule.titleContains,
        message_contains: route.rule.messageContains,
      },
      destination_ids: route.destinationIds,
    })),
  });
}

export function tomlDocumentToConfiguration(documentInput: unknown): Configuration {
  const document = TomlDocumentSchema.parse(documentInput);

  return ConfigurationSchema.parse({
    settings: {
      schemaVersion: document.settings.schema_version,
      exportedAt: document.settings.exported_at,
      includeSecrets: document.settings.include_secrets,
      locale: document.settings.locale,
      timeZone: document.settings.time_zone,
      rawPayloadRetentionDays: document.settings.raw_payload_retention_days,
    },
    feishuApps: document.feishu_apps.map((app) => ({
      id: app.id,
      name: app.name,
      appId: app.app_id,
      appSecret: app.app_secret,
      secretRefs: app.secret_refs,
    })),
    sources: document.sources.map((source) => ({
      id: source.id,
      name: source.name,
      provider: source.provider,
      enabled: source.enabled,
      config: source.config,
      secretRefs: source.secret_refs,
    })),
    destinations: document.destinations.map((destination) => ({
      id: destination.id,
      name: destination.name,
      kind: destination.kind,
      enabled: destination.enabled,
      config: destination.config,
      secretRefs: destination.secret_refs,
    })),
    routes: document.routes.map((route) => ({
      id: route.id,
      name: route.name,
      enabled: route.enabled,
      rule: {
        sourceIds: route.rule.source_ids,
        severities: route.rule.severities,
        statuses: route.rule.statuses,
        labels: route.rule.labels.map((label) => LabelMatcherSchema.parse(label)),
        titleContains: route.rule.title_contains,
        messageContains: route.rule.message_contains,
      },
      destinationIds: route.destination_ids,
    })),
  });
}
