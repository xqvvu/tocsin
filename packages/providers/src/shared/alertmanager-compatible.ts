import {
  NormalizedEventSchema,
  createStableHash,
  isJsonObject,
  stableStringify,
} from "@tocsin/core";
import type { JsonObject, Labels } from "@tocsin/core";

import { normalizeSeverity, normalizeStatus } from "#providers/shared/normalization";
import {
  firstString,
  firstValue,
  labelsFromObject,
  normalizeStringDate,
  objectValue,
  setOptionalString,
} from "#providers/shared/object";
import type { ProviderParseInput, ProviderParseOutput } from "#providers/types";

export interface AlertmanagerCompatibleParseOptions {
  provider: string;
  defaultTitle: string;
}

export function parseAlertmanagerCompatibleProvider(
  input: ProviderParseInput,
  options: AlertmanagerCompatibleParseOptions,
): ProviderParseOutput {
  if (!isJsonObject(input.payload)) {
    throw new Error(`Expected ${options.provider} webhook payload object`);
  }

  const payload = input.payload;
  const payloadHash = createStableHash(input.payload);
  const alerts = extractAlerts(payload);
  const firstAlert = alerts[0];
  const labels = extractLabels(payload, firstAlert);
  const commonAnnotations = objectValue(payload.commonAnnotations);
  const alertAnnotations = objectValue(firstAlert?.annotations);
  const title =
    labels.alertname ??
    firstString(commonAnnotations, ["summary"]) ??
    firstString(alertAnnotations, ["summary"]) ??
    options.defaultTitle;
  const message =
    firstString(alertAnnotations, ["description", "summary"]) ??
    firstString(commonAnnotations, ["description", "summary"]) ??
    stableStringify(input.payload);
  const status = normalizeStatus(
    firstString(payload, ["status"]) ?? firstString(firstAlert, ["status"]),
  );
  const occurredAt = normalizeStringDate(
    status === "resolved"
      ? firstValue(firstAlert, ["endsAt", "ends_at"])
      : firstValue(firstAlert, ["startsAt", "starts_at"]),
    input.receivedAt,
  );

  const providerMetadata: JsonObject = {
    provider: options.provider,
    parserVersion: 1,
    payloadHash,
    alertCount: alerts.length,
  };
  setOptionalString(providerMetadata, "receiver", firstString(payload, ["receiver"]));
  setOptionalString(providerMetadata, "groupKey", firstString(payload, ["groupKey", "group_key"]));
  setOptionalString(
    providerMetadata,
    "externalURL",
    firstString(payload, ["externalURL", "external_url"]),
  );
  setOptionalString(
    providerMetadata,
    "generatorURL",
    firstString(firstAlert, ["generatorURL", "generator_url"]),
  );
  setOptionalString(
    providerMetadata,
    "silenceURL",
    firstString(firstAlert, ["silenceURL", "silence_url"]),
  );

  return {
    normalized: NormalizedEventSchema.parse({
      title,
      message,
      severity: normalizeSeverity(labels.severity),
      status,
      fingerprint:
        firstString(firstAlert, ["fingerprint"]) ??
        firstString(payload, ["groupKey", "group_key"]) ??
        `${options.provider}:${payloadHash}`,
      labels,
      occurredAt,
    }),
    providerMetadata,
    idempotencyKey: `${options.provider}:${payloadHash}`,
  };
}

function extractAlerts(payload: JsonObject): JsonObject[] {
  const alerts = payload.alerts;
  return Array.isArray(alerts) ? alerts.filter(isJsonObject) : [];
}

function extractLabels(payload: JsonObject, firstAlert: JsonObject | undefined): Labels {
  return {
    ...labelsFromObject(objectValue(payload.commonLabels)),
    ...labelsFromObject(objectValue(firstAlert?.labels)),
  };
}
