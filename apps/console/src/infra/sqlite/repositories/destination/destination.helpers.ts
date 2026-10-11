import {
  decodeJsonObject,
  DestinationKindSchema,
  DestinationOperationalConfigSchema,
  isSensitiveKey,
} from "@tocsin/core";
import type {
  DestinationEditorFormDraft,
  DestinationKind,
  DestinationListItem,
  DestinationOperationalConfig,
  DestinationSummary,
  JsonObject,
} from "@tocsin/core";

import { fromSqliteBoolean } from "#/infra/sqlite/codecs";
import { RecordNotFoundError } from "#/infra/sqlite/errors";
import type {
  DestinationRow,
  DestinationRuntimeConfig,
} from "#/infra/sqlite/repositories/destination/destination.interface";

export function destinationSummaryFromRow(row: DestinationRow): DestinationSummary {
  return {
    id: row.id,
    name: row.name,
    kind: DestinationKindSchema.parse(row.kind),
    enabled: fromSqliteBoolean(row.enabled),
  };
}

export function destinationRuntimeFromRow(row: DestinationRow): DestinationRuntimeConfig {
  return {
    ...destinationSummaryFromRow(row),
    config: decodeJsonObject(row.config_json),
    secretRefs: decodeJsonObject(row.secret_refs_json),
  };
}

export function destinationSummaryFromRuntime(
  destination: DestinationRuntimeConfig,
): DestinationSummary {
  return {
    id: destination.id,
    name: destination.name,
    kind: destination.kind,
    enabled: destination.enabled,
  };
}

export function destinationListItemFromRuntime(
  destination: DestinationRuntimeConfig,
): DestinationListItem {
  return {
    ...destinationSummaryFromRuntime(destination),
    operationalConfig: destinationOperationalConfigFromRuntime(destination),
  };
}

export function destinationOperationalConfigFromRuntime(
  destination: DestinationRuntimeConfig,
): DestinationOperationalConfig {
  const config = destination.config;
  const endpoint = configEndpoint(destination.kind, config);
  const template = configTemplateMeta(config);
  const method =
    destination.kind === "generic_webhook"
      ? parseHttpMethod(configString(config, "method") ?? "POST")
      : null;
  const to = destination.kind === "email" ? configStringArray(config, "to") : null;
  const from = destination.kind === "email" ? configString(config, "from") : null;
  const replyTo = destination.kind === "email" ? configString(config, "replyTo") : null;
  const subjectPrefix = destination.kind === "email" ? configString(config, "subjectPrefix") : null;
  const headerNames =
    destination.kind === "email" || destination.kind === "generic_webhook"
      ? configHeaderNames(config)
      : null;
  const signingConfigured =
    destination.kind === "feishu" ? hasConfiguredString(config, "signSecret") : false;
  const feishuApp = destination.kind === "feishu" ? configPlainObject(config, "app") : null;
  const feishuUrgent = destination.kind === "feishu" ? configPlainObject(config, "urgent") : null;
  const urgentReceivers = feishuUrgent ? configStringArray(feishuUrgent, "receivers") : null;

  return DestinationOperationalConfigSchema.parse({
    endpoint,
    host: urlHost(endpoint),
    method,
    to: to && to.length > 0 ? to : null,
    from,
    replyTo,
    subjectPrefix,
    headerNames: headerNames && headerNames.length > 0 ? headerNames : null,
    templateConfigured: template.configured,
    templateMode: template.mode,
    templateSource: template.source,
    signingConfigured,
    secretFieldPaths: configuredSecretFieldPaths(destination.kind, config),
    sendMode: destination.kind === "feishu" ? (feishuSendMode(config) ?? "webhook") : null,
    appRef: feishuApp ? configString(feishuApp, "appRef") : null,
    chatId: feishuApp ? configString(feishuApp, "chatId") : null,
    urgentAutoEnabled:
      feishuUrgent && typeof feishuUrgent.autoEnabled === "boolean"
        ? feishuUrgent.autoEnabled
        : null,
    urgentReceivers: urgentReceivers && urgentReceivers.length > 0 ? urgentReceivers : null,
  });
}

export function destinationEditorFormDraftFromRuntime(
  destination: DestinationRuntimeConfig,
): DestinationEditorFormDraft {
  const config = destination.config;
  const feishuApp = destination.kind === "feishu" ? configPlainObject(config, "app") : null;
  const feishuUrgent = destination.kind === "feishu" ? configPlainObject(config, "urgent") : null;

  return {
    endpointUrl: configString(config, "endpointUrl") ?? "",
    to: configStringArray(config, "to").join(", "),
    from: configString(config, "from") ?? "",
    replyTo: configString(config, "replyTo") ?? "",
    subjectPrefix: configString(config, "subjectPrefix") ?? "",
    subjectTemplate: configString(config, "subjectTemplate") ?? "",
    htmlTemplate: configString(config, "htmlTemplate") ?? "",
    headers: configHeaderLinesForEditor(config),
    url: configString(config, "url") ?? "",
    webhookUrl: configString(config, "webhookUrl") ?? "",
    method: configString(config, "method") ?? "",
    sendMode: feishuSendMode(config) ?? "webhook",
    appRef: feishuApp ? (configString(feishuApp, "appRef") ?? "") : "",
    chatId: feishuApp ? (configString(feishuApp, "chatId") ?? "") : "",
    urgentAutoEnabled:
      feishuUrgent && typeof feishuUrgent.autoEnabled === "boolean"
        ? feishuUrgent.autoEnabled
        : true,
    urgentSeverities: feishuUrgent ? configStringArray(feishuUrgent, "severities") : ["critical"],
    urgentUserIdType: feishuUrgent
      ? (configString(feishuUrgent, "userIdType") ?? "open_id")
      : "open_id",
    urgentReceivers: feishuUrgent ? configStringArray(feishuUrgent, "receivers").join(", ") : "",
  };
}

/**
 * Delivery detail metadata for operators: full operational endpoint is OK in a
 * private dashboard; signing secrets and header values stay out.
 */
export function destinationMetadataFromRuntime(destination: DestinationRuntimeConfig): JsonObject {
  const operational = destinationOperationalConfigFromRuntime(destination);
  const metadata: JsonObject = {
    templateConfigured: operational.templateConfigured,
  };

  if (operational.endpoint) {
    metadata.endpoint = operational.endpoint;
  }

  if (operational.host) {
    metadata.host = operational.host;
  }

  if (operational.templateMode) {
    metadata.templateMode = operational.templateMode;
  }

  if (operational.templateSource) {
    metadata.templateSource = operational.templateSource;
  }

  if (destination.kind === "generic_webhook") {
    metadata.method = operational.method ?? "POST";
    if (operational.headerNames) {
      metadata.headerNames = operational.headerNames;
    }
    return metadata;
  }

  if (destination.kind === "feishu") {
    metadata.signingEnabled = operational.signingConfigured;

    if (operational.sendMode === "app") {
      metadata.sendMode = "app";

      if (operational.chatId) {
        metadata.chatId = operational.chatId;
      }

      if (operational.urgentReceivers) {
        metadata.urgentReceiverCount = operational.urgentReceivers.length;
      }
    }

    return metadata;
  }

  if (destination.kind === "slack") {
    return metadata;
  }

  if (destination.kind === "email") {
    if (operational.to) {
      metadata.to = operational.to;
    }
    if (operational.from) {
      metadata.from = operational.from;
    }
    if (operational.replyTo) {
      metadata.replyTo = operational.replyTo;
    }
    if (operational.subjectPrefix) {
      metadata.subjectPrefix = operational.subjectPrefix;
    }
    if (operational.headerNames) {
      metadata.headerNames = operational.headerNames;
    }
  }

  return metadata;
}

export function requireDestination(
  destination: DestinationRuntimeConfig | null,
): DestinationRuntimeConfig {
  if (!destination) {
    throw new RecordNotFoundError("Destination");
  }

  return destination;
}

function configuredSecretFieldPaths(kind: DestinationKind, config: JsonObject): string[] {
  const paths: string[] = [];

  switch (kind) {
    case "feishu":
      if (hasConfiguredString(config, "webhookUrl")) {
        paths.push("webhookUrl");
      }
      if (hasConfiguredString(config, "signSecret")) {
        paths.push("signSecret");
      }
      break;
    case "slack":
      if (hasConfiguredString(config, "webhookUrl")) {
        paths.push("webhookUrl");
      }
      break;
    case "email":
      if (hasConfiguredString(config, "endpointUrl")) {
        paths.push("endpointUrl");
      }
      for (const name of configHeaderNames(config)) {
        if (isSensitiveKey(name)) {
          paths.push(`headers.${name}`);
        }
      }
      break;
    case "generic_webhook":
      if (hasConfiguredString(config, "url")) {
        paths.push("url");
      }
      for (const name of configHeaderNames(config)) {
        if (isSensitiveKey(name)) {
          paths.push(`headers.${name}`);
        }
      }
      break;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }

  return paths;
}

function configEndpoint(kind: DestinationKind, config: JsonObject): string | null {
  switch (kind) {
    case "feishu":
    case "slack":
      return configString(config, "webhookUrl");
    case "email":
      return configString(config, "endpointUrl");
    case "generic_webhook":
      return configString(config, "url");
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function configTemplateMeta(config: JsonObject): {
  configured: boolean;
  mode: string | null;
  source: "builtin" | "custom" | null;
} {
  const template = config.template;

  if (!template || typeof template !== "object" || Array.isArray(template)) {
    return { configured: false, mode: null, source: null };
  }

  const record = template as JsonObject;
  const sourceValue = record.source;
  const source =
    sourceValue === "builtin" || sourceValue === "custom"
      ? sourceValue
      : typeof record.mode === "string"
        ? "custom"
        : null;
  const mode =
    source === "builtin"
      ? "builtin"
      : typeof record.mode === "string" && record.mode.trim()
        ? record.mode
        : null;

  return {
    configured: true,
    mode,
    source,
  };
}

function urlHost(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).host || null;
  } catch {
    return null;
  }
}

function parseHttpMethod(value: string): "POST" | "PUT" | "PATCH" | null {
  if (value === "POST" || value === "PUT" || value === "PATCH") {
    return value;
  }

  return null;
}

function hasConfiguredString(config: JsonObject, key: string): boolean {
  return Boolean(configString(config, key));
}

function configString(config: JsonObject, key: string): string | null {
  const value = config[key];

  return typeof value === "string" && value.trim() ? value : null;
}

function configStringArray(config: JsonObject, key: string): string[] {
  const value = config[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function configPlainObject(config: JsonObject, key: string): JsonObject | null {
  const value = config[key];

  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function feishuSendMode(config: JsonObject): "webhook" | "app" | null {
  const value = config.sendMode;

  if (value === "webhook" || value === "app") {
    return value;
  }

  return value === undefined ? "webhook" : null;
}

function configHeaderNames(config: JsonObject): string[] {
  const headers = config.headers;

  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return [];
  }

  return Object.keys(headers).sort();
}

function configHeaderLinesForEditor(config: JsonObject): string {
  const headers = config.headers;

  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return "";
  }

  return Object.entries(headers as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => {
      if (isSensitiveKey(name)) {
        return `${name}:`;
      }

      return `${name}: ${typeof value === "string" ? value : ""}`;
    })
    .join("\n");
}
