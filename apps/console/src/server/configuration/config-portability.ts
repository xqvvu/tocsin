import { parse, stringify } from "smol-toml";
import { z } from "zod";

import {
  isSensitiveKey,
  isSafeSecretPath,
  CONFIG_SCHEMA_VERSION,
  ConfigurationSchema,
  configurationToTomlDocument,
  tomlDocumentToConfiguration,
  type FeishuApp,
  type JsonObject,
  type JsonValue,
  type RouteDefinition,
  type ConfigDestination,
  type ConfigFeishuApp,
  type ConfigSource,
  type Configuration,
  type SecretReferences,
} from "@tocsin/core";

import type { DestinationRuntimeConfig } from "#/infra/sqlite/repositories/destination/destination.interface";
import type { SourceRuntimeConfig } from "#/infra/sqlite/repositories/source/source.interface";
import { DomainValidationError } from "#/server/runtime/domain-errors";

export type PortableConfiguration = Configuration;
export type PortableDestination = ConfigDestination;
export type PortableSource = ConfigSource;
export type PortableFeishuApp = ConfigFeishuApp;

export interface ExportConfigurationOptions {
  includeSecrets?: boolean;
  now?: () => string;
}

export interface ImportConfigurationOptions {
  env?: Record<string, string | undefined>;
}

export const PortableConfigurationSchema = ConfigurationSchema;

export function createPortableConfiguration(
  input: {
    feishuApps: FeishuApp[];
    sources: SourceRuntimeConfig[];
    destinations: DestinationRuntimeConfig[];
    routes: RouteDefinition[];
    settings: {
      locale: Configuration["settings"]["locale"];
      timeZone: string;
      rawPayloadRetentionDays: number;
    };
  },
  options: ExportConfigurationOptions = {},
): PortableConfiguration {
  if (options.includeSecrets) {
    throw new DomainValidationError("Plaintext secret export is not supported");
  }

  return ConfigurationSchema.parse({
    settings: {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      exportedAt: options.now?.() ?? new Date().toISOString(),
      includeSecrets: false,
      locale: input.settings.locale,
      timeZone: input.settings.timeZone,
      rawPayloadRetentionDays: input.settings.rawPayloadRetentionDays,
    },
    feishuApps: input.feishuApps.map((app) => sanitizeFeishuAppConfig(app)),
    sources: input.sources.map((source) => sanitizeSourceConfig(source)),
    destinations: input.destinations.map((destination) => {
      const sanitized = sanitizeDestinationConfig(destination);

      return {
        id: destination.id,
        name: destination.name,
        kind: destination.kind,
        enabled: destination.enabled,
        config: sanitized.config,
        secretRefs: sanitized.secretRefs,
      };
    }),
    routes: input.routes.map((route) => ({
      id: route.id,
      name: route.name,
      enabled: route.enabled,
      rule: route.rule,
      destinationIds: route.destinationIds,
    })),
  });
}

export function serializePortableConfigurationToml(config: PortableConfiguration): string {
  return [
    "# Tocsin portable configuration",
    "# Secrets are omitted by default; secret_refs entries point to environment variables.",
    stringify(configurationToTomlDocument(config)).trimEnd(),
    "",
  ].join("\n");
}

export function serializePortableConfigurationJson(config: PortableConfiguration): string {
  return `${JSON.stringify(configurationToTomlDocument(config), null, 2)}\n`;
}

export function parsePortableConfigurationToml(toml: string): PortableConfiguration {
  return parsePortableDocument(() => parse(toml), "TOML");
}

export function parsePortableConfigurationJson(json: string): PortableConfiguration {
  return parsePortableDocument(() => JSON.parse(json), "JSON");
}

/**
 * Wraps document decoding and schema validation so malformed operator input is a
 * `DomainValidationError` instead of a raw `TomlError` / `SyntaxError` / `ZodError`
 * bubbling up as an opaque 500. The message is shown in the console, so it
 * describes the offending construct without echoing the whole payload.
 */
function parsePortableDocument(
  decode: () => unknown,
  format: "TOML" | "JSON",
): PortableConfiguration {
  try {
    return tomlDocumentToConfiguration(decode());
  } catch (error) {
    throw new DomainValidationError(
      `Invalid ${format} configuration: ${describeParseFailure(error)}`,
      {
        cause: error,
      },
    );
  }
}

function describeParseFailure(error: unknown): string {
  if (error instanceof z.ZodError) {
    const [issue] = error.issues;

    return issue ? `${issue.path.join(".") || "(root)"}: ${issue.message}` : error.message;
  }

  return error instanceof Error ? error.message : String(error);
}

export function resolveDestinationSecretRefs(
  destination: PortableDestination,
  options: ImportConfigurationOptions = {},
): PortableDestination {
  return resolvePortableSecretRefs(destination, options, "destination");
}

export function resolveSourceSecretRefs(
  source: PortableSource,
  options: ImportConfigurationOptions = {},
): PortableSource {
  return resolvePortableSecretRefs(source, options, "source");
}

export interface ResolvedFeishuApp {
  id: string;
  name: string;
  appId: string;
  appSecret: string;
}

/**
 * Resolves the app secret for import.
 *
 * Exported documents omit the secret and carry a `secretRefs.appSecret` env
 * reference; the value is read from the environment at import time, so a
 * checked-in configuration file never contains the plaintext credential.
 */
export function resolveFeishuAppSecretRefs(
  app: PortableFeishuApp,
  options: ImportConfigurationOptions = {},
): ResolvedFeishuApp {
  const envName = app.secretRefs.appSecret ? secretRefEnvName(app.secretRefs.appSecret) : null;
  const value = app.appSecret?.trim()
    ? app.appSecret
    : envName
      ? (options.env ?? {})[envName]
      : undefined;

  if (!value) {
    throw new DomainValidationError(
      envName
        ? `Missing environment variable for feishu app secret: ${envName}`
        : `Feishu app "${app.name}" is missing its app secret`,
    );
  }

  return {
    id: app.id,
    name: app.name,
    appId: app.appId,
    appSecret: value,
  };
}

function resolvePortableSecretRefs<T extends { config: JsonObject; secretRefs: SecretReferences }>(
  entry: T,
  options: ImportConfigurationOptions,
  resource: "source" | "destination",
): T {
  const config = structuredClone(entry.config);
  const env = options.env ?? {};

  for (const [path, ref] of Object.entries(entry.secretRefs)) {
    const envName = secretRefEnvName(ref);

    if (!envName) {
      continue;
    }

    const value = env[envName];

    if (value === undefined) {
      throw new DomainValidationError(
        `Missing environment variable for ${resource} secret: ${envName}`,
      );
    }

    setJsonPath(config, path, value);
  }

  return {
    ...entry,
    config,
  };
}

function sanitizeFeishuAppConfig(app: FeishuApp): PortableFeishuApp {
  return {
    id: app.id,
    name: app.name,
    appId: app.appId,
    secretRefs: {
      appSecret: { env: envNameForFeishuAppSecret(app) },
    },
  };
}

function envNameForFeishuAppSecret(app: FeishuApp): string {
  return `TOCSIN_FEISHU_APP_${slugEnvPart(app.id)}_${slugEnvPart("appSecret")}`;
}

function sanitizeSourceConfig(source: SourceRuntimeConfig): PortableSource {
  const secretPaths = sourceSecretPaths(source);
  const config = omitJsonPaths(omitSensitiveJson(source.config), secretPaths);
  const secretRefs = normalizeSecretRefs({});

  for (const path of secretPaths) {
    if (getJsonPath(source.config, path) !== undefined && secretRefs[path] === undefined) {
      secretRefs[path] = { env: envNameForSourceSecret(source, path) };
    }
  }

  return {
    id: source.id,
    name: source.name,
    provider: source.provider,
    enabled: source.enabled,
    config,
    secretRefs,
  };
}

function sanitizeDestinationConfig(destination: DestinationRuntimeConfig): {
  config: JsonObject;
  secretRefs: SecretReferences;
} {
  const secretPaths = destinationSecretPaths(destination);
  const config = omitJsonPaths(omitSensitiveJson(destination.config), secretPaths);
  const secretRefs = normalizeSecretRefs(destination.secretRefs);

  for (const path of secretPaths) {
    if (getJsonPath(destination.config, path) !== undefined && secretRefs[path] === undefined) {
      secretRefs[path] = { env: envNameForSecret(destination, path) };
    }
  }

  return { config, secretRefs };
}

function destinationSecretPaths(destination: DestinationRuntimeConfig): string[] {
  const paths: string[] =
    destination.kind === "generic_webhook"
      ? ["url"]
      : destination.kind === "feishu"
        ? ["webhookUrl", "signSecret"]
        : destination.kind === "slack"
          ? ["webhookUrl"]
          : destination.kind === "email"
            ? ["endpointUrl"]
            : [];
  const headers = destination.config.headers;

  if (headers && typeof headers === "object" && !Array.isArray(headers)) {
    for (const key of Object.keys(headers)) {
      if (isSensitiveKey(key)) {
        paths.push(`headers.${key}`);
      }
    }
  }

  return paths;
}

function sourceSecretPaths(source: SourceRuntimeConfig): string[] {
  const paths: string[] = [];

  for (const key of Object.keys(source.config)) {
    if (isSensitiveKey(key)) {
      paths.push(key);
    }
  }

  return paths;
}

function omitSensitiveJson(value: JsonObject): JsonObject {
  return omitSensitiveEntries(value) as JsonObject;
}

function omitSensitiveEntries(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(omitSensitiveEntries);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !isSensitiveKey(key))
        .map(([key, entry]) => [key, omitSensitiveEntries(entry)]),
    );
  }

  return value;
}

function omitJsonPaths(input: JsonObject, paths: string[]): JsonObject {
  const output = structuredClone(input);

  for (const path of paths) {
    deleteJsonPath(output, path);
  }

  return output;
}

function getJsonPath(input: JsonObject, path: string): JsonValue | undefined {
  let current: JsonValue | undefined = input;

  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function setJsonPath(input: JsonObject, path: string, value: JsonValue): void {
  if (!isSafeSecretPath(path)) {
    throw new DomainValidationError(`Unsafe destination secret reference path: ${path}`);
  }

  const segments = path.split(".");
  let current: JsonObject = input;

  for (const segment of segments.slice(0, -1)) {
    const next = current[segment];

    if (!next || typeof next !== "object" || Array.isArray(next)) {
      current[segment] = {};
    }

    current = current[segment] as JsonObject;
  }

  current[segments.at(-1)!] = value;
}

function deleteJsonPath(input: JsonObject, path: string): void {
  const segments = path.split(".");
  let current: JsonObject = input;

  for (const segment of segments.slice(0, -1)) {
    const next = current[segment];

    if (!next || typeof next !== "object" || Array.isArray(next)) {
      return;
    }

    current = next as JsonObject;
  }

  delete current[segments.at(-1)!];
}

function envNameForSecret(destination: DestinationRuntimeConfig, path: string): string {
  return `TOCSIN_DEST_${slugEnvPart(destination.id)}_${slugEnvPart(path)}`;
}

function envNameForSourceSecret(source: SourceRuntimeConfig, path: string): string {
  return `TOCSIN_SOURCE_${slugEnvPart(source.id)}_${slugEnvPart(path)}`;
}

function slugEnvPart(value: string): string {
  return value
    .replaceAll(/[^a-zA-Z0-9]+/g, "_")
    .replaceAll(/^_+|_+$/g, "")
    .toUpperCase();
}

function secretRefEnvName(ref: JsonValue): string | null {
  if (ref && typeof ref === "object" && !Array.isArray(ref)) {
    const env = ref.env;
    return typeof env === "string" && env.trim() ? env.trim() : null;
  }

  return null;
}

function normalizeSecretRefs(secretRefs: JsonObject): SecretReferences {
  const normalized: SecretReferences = {};

  for (const [path, ref] of Object.entries(secretRefs)) {
    const env =
      secretRefEnvName(ref) ?? (typeof ref === "string" && ref.trim() ? ref.trim() : null);

    if (env) {
      normalized[path] = { env };
    }
  }

  return normalized;
}
