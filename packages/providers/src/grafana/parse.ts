import {
  NormalizedEventSchema,
  createStableHash,
  isJsonObject,
  stableStringify,
} from "@tocsin/core";
import type { JsonObject, Labels } from "@tocsin/core";

import type { GrafanaProviderConfig } from "#providers/grafana/schema";
import { normalizeSeverity, normalizeStatus } from "#providers/shared/normalization";
import {
  firstString,
  firstValue,
  labelsFromObject,
  normalizeStringDate,
  objectValue,
  setOptionalString,
} from "#providers/shared/object";
import {
  type ProviderParseInput,
  type ProviderParseOutput,
  type ProviderParseResult,
  type ProviderStandaloneParseInput,
} from "#providers/types";
import { ParseInput, ParseResult } from "#providers/utils";

export function parseGrafanaProviderResult(
  input: ProviderParseInput<GrafanaProviderConfig>,
): ProviderParseResult {
  if (!isJsonObject(input.payload)) {
    throw new Error("Expected grafana webhook payload object");
  }

  const payload = input.payload;
  const payloadHash = createStableHash(input.payload);
  const alerts = extractAlerts(payload);
  const firstAlert = alerts[0];
  const labels = extractLabels(payload, firstAlert);
  const commonAnnotations = objectValue(payload.commonAnnotations);
  const alertAnnotations = objectValue(firstAlert?.annotations);
  const title =
    firstString(payload, ["title"]) ??
    firstString(commonAnnotations, ["summary"]) ??
    firstString(alertAnnotations, ["summary"]) ??
    labels.alertname ??
    "Grafana alert";
  const message =
    firstString(payload, ["message"]) ??
    firstString(alertAnnotations, ["description", "summary"]) ??
    firstString(commonAnnotations, ["description", "summary"]) ??
    stableStringify(input.payload);
  const occurredAt = normalizeStringDate(
    firstAlert?.status === "resolved"
      ? firstValue(firstAlert, ["endsAt", "ends_at"])
      : firstValue(firstAlert, ["startsAt", "starts_at"]),
    input.receivedAt,
  );

  const providerMetadata: JsonObject = {
    provider: "grafana",
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
    "dashboardURL",
    firstString(firstAlert, ["dashboardURL", "dashboard_url"]),
  );
  setOptionalString(
    providerMetadata,
    "panelURL",
    firstString(firstAlert, ["panelURL", "panel_url"]),
  );
  setOptionalString(
    providerMetadata,
    "silenceURL",
    firstString(firstAlert, ["silenceURL", "silence_url"]),
  );

  return ParseResult.ok({
    normalized: NormalizedEventSchema.parse({
      title,
      message,
      severity: normalizeSeverity(labels.severity),
      status: normalizeStatus(
        firstString(payload, ["status"]) ?? firstString(firstAlert, ["status"]),
      ),
      fingerprint:
        firstString(firstAlert, ["fingerprint"]) ??
        firstString(payload, ["groupKey", "group_key"]) ??
        `grafana:${payloadHash}`,
      labels,
      occurredAt,
    }),
    providerMetadata,
    idempotencyKey: `grafana:${payloadHash}`,
  });
}

export function parseGrafanaProvider(
  input: ProviderStandaloneParseInput<GrafanaProviderConfig>,
): ProviderParseOutput {
  return ParseResult.unwrap(
    parseGrafanaProviderResult(ParseInput.fromStandalone("grafana", input, input.config ?? {})),
  );
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
