import "@tanstack/react-start/server-only";
import { randomBytes } from "node:crypto";

import { JsonObjectSchema, redactText } from "@tocsin/core";
import type { DestinationKind, JsonObject, JsonValue, NormalizedEvent } from "@tocsin/core";
import type { DestinationRegistry } from "@tocsin/destinations";

import type { SqliteStore } from "#/infra/sqlite/store";
import { DomainValidationError } from "#/server/runtime/domain-errors";

export function generateSourceToken(): string {
  return `tocsin_src_${randomBytes(24).toString("base64url")}`;
}

export function createTestNormalizedEvent(): NormalizedEvent {
  return {
    title: "Tocsin destination test",
    message: "This is a test alert generated from Tocsin Console.",
    severity: "info",
    status: "firing",
    fingerprint: "tocsin:test-destination",
    labels: {
      source: "tocsin",
      test: "true",
    },
    occurredAt: new Date().toISOString(),
  };
}

export function redactNullableText(value: string | null): string | null {
  return value === null ? null : redactText(value);
}

export function parseDestinationConfig(
  destinations: DestinationRegistry,
  kind: DestinationKind,
  config: JsonObject,
): JsonObject {
  return JsonObjectSchema.parse(destinations.parse(kind, config));
}

export async function requireExistingSourceIds(
  sourceIds: string[],
  sources: Pick<SqliteStore["sources"], "get">,
): Promise<void> {
  const missing: string[] = [];

  for (const id of new Set(sourceIds)) {
    if ((await sources.get(id)) === null) {
      missing.push(id);
    }
  }

  if (missing.length > 0) {
    throw new DomainValidationError(`Unknown source IDs: ${missing.join(", ")}`);
  }
}

export async function requireExistingDestinationIds(
  destinationIds: string[],
  destinations: Pick<SqliteStore["destinations"], "get">,
): Promise<void> {
  const missing: string[] = [];

  for (const id of new Set(destinationIds)) {
    if ((await destinations.get(id)) === null) {
      missing.push(id);
    }
  }

  if (missing.length > 0) {
    throw new DomainValidationError(`Unknown destination IDs: ${missing.join(", ")}`);
  }
}

/** The `app` object of a Feishu destination config, when present and well-formed. */
export function feishuAppTargetFromConfig(config: JsonObject): JsonObject | null {
  const app = config.app;

  return app && typeof app === "object" && !Array.isArray(app) ? (app as JsonObject) : null;
}

export function feishuAppRefFromConfig(config: JsonObject): string | null {
  const appRef = feishuAppTargetFromConfig(config)?.appRef;

  return typeof appRef === "string" && appRef.trim() ? appRef.trim() : null;
}

/**
 * Effective Feishu send mode of a (possibly pre-sendMode) config.
 *
 * Mirrors the schema default: a config without `sendMode` is a webhook
 * destination, so a leftover `app` block on such a config is inert and must not
 * block app deletion or fail delivery resolution.
 */
export function feishuSendModeFromConfig(config: JsonObject): "webhook" | "app" {
  return config.sendMode === "app" ? "app" : "webhook";
}

/**
 * Rejects a Feishu destination config whose app reference does not resolve.
 *
 * App send mode and urgent paging both depend on the registered app, so a
 * dangling reference is a save-time error instead of a runtime surprise.
 */
export async function requireExistingFeishuAppRefs(
  config: JsonObject,
  feishuApps: Pick<SqliteStore["feishuApps"], "get">,
): Promise<void> {
  if (feishuSendModeFromConfig(config) !== "app") {
    return;
  }

  const appRef = feishuAppRefFromConfig(config);

  if (!appRef) {
    return;
  }

  if ((await feishuApps.get(appRef)) === null) {
    throw new DomainValidationError(`Unknown Feishu app reference: ${appRef}`);
  }
}

export function mergeJsonObjects(base: JsonObject, patch: JsonObject): JsonObject {
  const output: JsonObject = { ...base };

  for (const [key, value] of Object.entries(patch)) {
    const existing = output[key];

    output[key] =
      isPlainJsonObject(existing) && isPlainJsonObject(value)
        ? mergeJsonObjects(existing, value)
        : value;
  }

  return output;
}

function isPlainJsonObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
