import {
  NormalizedEventSchema,
  createStableHash,
  isJsonObject,
  stableStringify,
} from "@tocsin/core";
import type { JsonObject, Labels } from "@tocsin/core";

import { normalizeSeverity, normalizeStatus } from "#providers/shared/normalization";
import {
  firstScalarString,
  firstString,
  firstValue,
  normalizeDate,
  objectValue,
  setOptionalLabel,
} from "#providers/shared/object";
import {
  type ProviderParseInput,
  type ProviderParseOutput,
  type ProviderParseResult,
  type ProviderStandaloneParseInput,
} from "#providers/types";
import type { UptimeKumaProviderConfig } from "#providers/uptime-kuma/schema";
import { ParseInput, ParseResult } from "#providers/utils";

export function parseUptimeKumaProviderResult(
  input: ProviderParseInput<UptimeKumaProviderConfig>,
): ProviderParseResult {
  if (!isJsonObject(input.payload)) {
    throw new Error("Expected uptime_kuma webhook payload object");
  }

  const payload = input.payload;
  const payloadHash = createStableHash(input.payload);
  const monitor = objectValue(payload.monitor);
  const heartbeat = objectValue(payload.heartbeat) ?? objectValue(payload.heartbeatJSON);
  const monitorName =
    firstString(monitor, ["name", "friendly_name"]) ?? firstString(payload, ["monitorName"]);
  const monitorUrl = firstString(monitor, ["url", "hostname"]) ?? firstString(payload, ["url"]);
  const statusValue =
    firstValue(heartbeat, ["status"]) ?? firstValue(payload, ["status", "monitorStatus"]);
  const status = normalizeUptimeKumaStatus(statusValue);
  const message =
    firstString(payload, ["msg", "message"]) ??
    firstString(heartbeat, ["msg", "message"]) ??
    stableStringify(input.payload);
  const title =
    firstString(payload, ["title"]) ??
    (monitorName ? `${monitorName} is ${status}` : "Uptime Kuma notification");
  const labels = extractLabels(payload, monitor);
  const occurredAt = normalizeDate(
    firstValue(heartbeat, ["time", "localDateTime", "created_date"]) ??
      firstValue(payload, ["time", "timestamp"]),
    input.receivedAt,
  );
  const fingerprint =
    firstScalarString(monitor, ["id"]) ??
    firstScalarString(payload, ["monitorID", "monitorId"]) ??
    monitorName ??
    monitorUrl ??
    `uptime_kuma:${payloadHash}`;

  return ParseResult.ok({
    normalized: NormalizedEventSchema.parse({
      title,
      message,
      severity: status === "firing" ? normalizeSeverity("critical") : normalizeSeverity("info"),
      status,
      fingerprint: `uptime_kuma:${fingerprint}`,
      labels,
      occurredAt,
    }),
    providerMetadata: {
      provider: "uptime_kuma",
      parserVersion: 1,
      payloadHash,
      payloadKeys: Object.keys(payload),
    },
    idempotencyKey: `uptime_kuma:${payloadHash}`,
  });
}

export function parseUptimeKumaProvider(
  input: ProviderStandaloneParseInput<UptimeKumaProviderConfig>,
): ProviderParseOutput {
  return ParseResult.unwrap(
    parseUptimeKumaProviderResult(
      ParseInput.fromStandalone("uptime_kuma", input, input.config ?? {}),
    ),
  );
}

function extractLabels(payload: JsonObject, monitor: JsonObject | undefined): Labels {
  const labels: Labels = {
    provider: "uptime_kuma",
  };

  const heartbeat = objectValue(payload.heartbeat) ?? objectValue(payload.heartbeatJSON);

  setOptionalLabel(labels, "monitor", firstString(monitor, ["name", "friendly_name"]));
  setOptionalLabel(labels, "monitor_id", firstScalarString(monitor, ["id"]));
  setOptionalLabel(labels, "monitor_path", firstString(monitor, ["pathName"]));
  setOptionalLabel(labels, "url", firstString(monitor, ["url", "hostname"]));
  setOptionalLabel(labels, "type", firstString(monitor, ["type"]));
  setOptionalLabel(labels, "response_time_ms", firstScalarString(heartbeat, ["ping"]));
  setOptionalLabel(labels, "last_down_at", firstString(heartbeat, ["lastDownTime"]));
  setOptionalLabel(labels, "tag", firstString(payload, ["tag"]));

  const rawLabels = payload.labels;
  if (isJsonObject(rawLabels)) {
    for (const [key, value] of Object.entries(rawLabels)) {
      if (typeof value === "string") {
        labels[key] = value;
      } else if (typeof value === "number" || typeof value === "boolean") {
        labels[key] = String(value);
      }
    }
  }

  return labels;
}

function normalizeUptimeKumaStatus(value: unknown): "firing" | "resolved" | "unknown" {
  if (typeof value === "number") {
    // Uptime Kuma heartbeat enum: 0 = DOWN, 1 = UP, 2 = PENDING (retry),
    // 3 = MAINTENANCE. Only a confirmed DOWN is a firing alert; pending and
    // maintenance are not outages, and an unrecognized future code is unknown
    // rather than a critical page. The string branch below already lands
    // "pending" and "maintenance" on unknown, so this keeps both encodings of
    // the same upstream state in agreement.
    if (value === 0) {
      return "firing";
    }

    if (value === 1) {
      return "resolved";
    }

    return "unknown";
  }

  return normalizeStatus(value);
}
