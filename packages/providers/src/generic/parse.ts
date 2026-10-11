import {
  NormalizedEventSchema,
  createStableHash,
  isJsonObject,
  stableStringify,
} from "@tocsin/core";
import type { JsonObject, Labels } from "@tocsin/core";

import type { GenericProviderConfig } from "#providers/generic/schema";
import { normalizeSeverity, normalizeStatus } from "#providers/shared/normalization";
import { firstString, firstValue, normalizeDate } from "#providers/shared/object";
import type { ProviderParseInput, ProviderParseResult } from "#providers/types";
import { ParseResult } from "#providers/utils";

export function parseGenericProviderResult(
  input: ProviderParseInput<GenericProviderConfig>,
): ProviderParseResult {
  const payload = isJsonObject(input.payload) ? input.payload : {};
  const payloadHash = createStableHash(input.payload);
  const labels = extractLabels(payload);

  const title =
    firstString(payload, ["title", "alert", "alertname", "name", "summary"]) ??
    "Generic webhook event";
  const message =
    firstString(payload, ["message", "description", "text", "body"]) ??
    stableStringify(input.payload);
  const severity = normalizeSeverity(
    firstString(payload, ["severity", "level", "priority"]) ?? labels.severity,
  );
  const status = normalizeStatus(firstString(payload, ["status", "state"]) ?? labels.status);
  const fingerprint =
    firstString(payload, ["fingerprint", "alertId", "alert_id"]) ?? `generic:${payloadHash}`;
  const idempotencyKey =
    firstString(payload, [
      "idempotencyKey",
      "idempotency_key",
      "requestId",
      "request_id",
      "eventId",
      "id",
    ]) ?? `generic:${payloadHash}`;
  const occurredAt = normalizeDate(
    firstValue(payload, [
      "occurredAt",
      "occurred_at",
      "startsAt",
      "starts_at",
      "time",
      "timestamp",
    ]),
    input.receivedAt,
  );

  return ParseResult.ok({
    normalized: NormalizedEventSchema.parse({
      title,
      message,
      severity,
      status,
      fingerprint,
      labels,
      occurredAt,
    }),
    providerMetadata: {
      provider: "generic",
      parserVersion: 1,
      payloadHash,
      payloadKeys: Object.keys(payload),
    },
    idempotencyKey,
  });
}

function extractLabels(payload: JsonObject): Labels {
  const labels: Labels = {};
  const rawLabels = payload.labels;

  if (isJsonObject(rawLabels)) {
    for (const [rawKey, rawValue] of Object.entries(rawLabels)) {
      const key = rawKey.trim();

      if (!key) {
        continue;
      }

      if (typeof rawValue === "string") {
        const value = rawValue.trim();

        if (value) {
          labels[key] = value;
        }
      } else if (typeof rawValue === "number" || typeof rawValue === "boolean") {
        labels[key] = String(rawValue);
      }
    }
  }

  for (const key of ["service", "environment", "env", "cluster", "team", "severity", "status"]) {
    const value = payload[key];

    if (typeof value === "string" && labels[key] === undefined) {
      labels[key] = value;
    }
  }

  return labels;
}
