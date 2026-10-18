import { createStableHash, isJsonObject, NormalizedEventSchema, redactText } from "@tocsin/core";
import type { AlertSeverity, JsonObject, Labels } from "@tocsin/core";

import type { FastgptProviderConfig } from "#providers/fastgpt/schema";
import { normalizeSeverity } from "#providers/shared/normalization";
import {
  firstScalarString,
  firstString,
  firstValue,
  normalizeDate,
  objectValue,
  setOptionalLabel,
  setOptionalString,
} from "#providers/shared/object";
import type {
  ProviderParseInput,
  ProviderParseOutput,
  ProviderParseResult,
  ProviderStandaloneParseInput,
} from "#providers/types";
import { ParseInput, ParseResult } from "#providers/utils";

const supportedEvents = ["model_status_error", "model_status_recovered"] as const;
type FastgptModelStatusEvent = (typeof supportedEvents)[number];

const PROBE_ERROR_REDACTED = "probe error redacted";
const CREDENTIAL_LIKE_TEXT_PATTERN =
  /(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}|bearer\s+\S{8,}|gh[a-z]_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{8,}/i;

export function parseFastgptProviderResult(
  input: ProviderParseInput<FastgptProviderConfig>,
): ProviderParseResult {
  if (!isJsonObject(input.payload)) {
    throw new Error("Expected fastgpt webhook payload object");
  }

  const payload = input.payload;
  const payloadHash = createStableHash(input.payload);
  const event = firstString(payload, ["event"]);
  const model = objectValue(payload.model);
  const probe = objectValue(payload.probe);
  const modelId = firstString(model, ["modelId", "model_id"]);

  if (!isSupportedEvent(event) || modelId === undefined) {
    return ParseResult.fail({
      reason: "unsupported_payload",
      message: unsupportedPayloadMessage(event, modelId),
      providerMetadata: {
        provider: "fastgpt",
        parserVersion: 1,
        payloadHash,
        payloadKeys: Object.keys(payload),
        ...(event === undefined ? {} : { event }),
      },
    });
  }

  const probeStatus = firstString(payload, ["status"]) ?? "unknown";
  const modelName = firstString(model, ["name", "model"]) ?? modelId;
  const attempts = firstScalarString(probe, ["attempts"]);
  const latencyMs = firstScalarString(probe, ["latencyMs", "latency_ms"]);
  const errorText = firstString(probe, ["error"]);
  const modelProvider = firstString(model, ["provider"]);
  const modelType = firstString(model, ["type"]);
  const occurredAt = normalizeDate(
    firstValue(probe, ["requestEndedAt", "startedAt"]) ?? firstValue(payload, ["occurredAt"]),
    input.receivedAt,
  );
  const providerMetadata: JsonObject = {
    provider: "fastgpt",
    parserVersion: 1,
    payloadHash,
    payloadKeys: Object.keys(payload),
    event,
    probeStatus,
    modelId,
  };

  setOptionalString(providerMetadata, "model", firstString(model, ["model"]));
  setOptionalString(providerMetadata, "modelName", firstString(model, ["name"]));
  setOptionalString(providerMetadata, "modelProvider", modelProvider);
  setOptionalString(providerMetadata, "modelType", modelType);
  setOptionalString(providerMetadata, "probeAttempts", attempts);
  setOptionalString(providerMetadata, "probeLatencyMs", latencyMs);

  return ParseResult.ok({
    normalized: NormalizedEventSchema.parse({
      title: `${modelName} model probe ${event === "model_status_error" ? "failed" : "recovered"}`,
      message: probeMessage({
        event,
        attempts,
        latencyMs,
        errorText,
        modelProvider,
        modelType,
      }),
      severity: probeSeverity(probeStatus),
      status: event === "model_status_error" ? "firing" : "resolved",
      fingerprint: `fastgpt:${modelId}`,
      labels: extractLabels(model, probe),
      occurredAt,
    }),
    providerMetadata,
    idempotencyKey: `fastgpt:${modelId}:${probeStatus}:${occurredAt}`,
  });
}

export function parseFastgptProvider(
  input: ProviderStandaloneParseInput<FastgptProviderConfig>,
): ProviderParseOutput {
  return ParseResult.unwrap(
    parseFastgptProviderResult(ParseInput.fromStandalone("fastgpt", input, input.config ?? {})),
  );
}

function isSupportedEvent(value: string | undefined): value is FastgptModelStatusEvent {
  return supportedEvents.includes(value as FastgptModelStatusEvent);
}

function unsupportedPayloadMessage(event: string | undefined, modelId: string | undefined): string {
  if (event === undefined) {
    return "FastGPT payload is missing the event field";
  }

  if (modelId === undefined) {
    return `FastGPT payload is missing model.modelId for event ${event}`;
  }

  return `Unsupported FastGPT event: ${event}`;
}

function probeSeverity(probeStatus: string): AlertSeverity {
  switch (probeStatus.trim().toLocaleLowerCase()) {
    case "red":
      return normalizeSeverity("critical");
    case "yellow":
      return normalizeSeverity("warning");
    case "green":
      return normalizeSeverity("info");
    default:
      return normalizeSeverity(undefined);
  }
}

function probeMessage(input: {
  event: FastgptModelStatusEvent;
  attempts: string | undefined;
  latencyMs: string | undefined;
  errorText: string | undefined;
  modelProvider: string | undefined;
  modelType: string | undefined;
}): string {
  const descriptor = describeModel(input.modelProvider, input.modelType);
  const attemptsPart =
    input.attempts === undefined ? "" : ` after ${attemptPhrase(input.attempts)}`;

  if (input.event === "model_status_recovered") {
    const latencyPart = input.latencyMs === undefined ? "" : ` in ${input.latencyMs} ms`;

    return `${descriptor} probe recovered${attemptsPart}${latencyPart}`;
  }

  const errorPart = input.errorText === undefined ? "" : `: ${redactProbeError(input.errorText)}`;

  return `${descriptor} probe failed${attemptsPart}${errorPart}`;
}

function redactProbeError(errorText: string): string {
  // A probe body that carries a credential has no operator value: even after
  // per-key redaction its code/message would still be surfaced, so hide the
  // whole body as soon as the raw text looks credential-shaped.
  if (CREDENTIAL_LIKE_TEXT_PATTERN.test(errorText)) {
    return PROBE_ERROR_REDACTED;
  }

  const redacted = redactText(errorText);
  if (CREDENTIAL_LIKE_TEXT_PATTERN.test(redacted)) {
    return PROBE_ERROR_REDACTED;
  }

  const match = /^(\d{3})\s+(\{[\s\S]*\})$/.exec(redacted);
  if (!match) return redacted;

  try {
    const body: unknown = JSON.parse(match[2]!);
    if (!isJsonObject(body)) return redacted;
    const error = isJsonObject(body.error) ? body.error : body;
    const message = typeof error.message === "string" ? error.message : undefined;
    const code = typeof error.code === "string" ? error.code : undefined;
    const type = typeof body.type === "string" ? body.type : undefined;
    const safeMessage =
      message === undefined || CREDENTIAL_LIKE_TEXT_PATTERN.test(message) ? undefined : message;
    const reason = [code, type].filter(Boolean).join(" · ");
    const summary = [reason, safeMessage].filter(Boolean).join(": ");
    return summary.length > 0 ? `${match[1]} ${summary}` : `${match[1]} upstream error`;
  } catch {
    return redacted;
  }
}

function describeModel(modelProvider: string | undefined, modelType: string | undefined): string {
  const qualifiers = [modelProvider, modelType].filter((value) => value !== undefined);

  return qualifiers.length === 0 ? "FastGPT model" : `${qualifiers.join(" ")} model`;
}

function attemptPhrase(attempts: string): string {
  return attempts === "1" ? "1 attempt" : `${attempts} attempts`;
}

function extractLabels(model: JsonObject | undefined, probe: JsonObject | undefined): Labels {
  const labels: Labels = {
    provider: "fastgpt",
  };

  setOptionalLabel(labels, "model_id", firstString(model, ["modelId", "model_id"]));
  setOptionalLabel(labels, "model", firstString(model, ["model"]));
  setOptionalLabel(labels, "model_name", firstString(model, ["name"]));
  setOptionalLabel(labels, "model_provider", firstString(model, ["provider"]));
  setOptionalLabel(labels, "model_type", firstString(model, ["type"]));
  setOptionalLabel(labels, "probe_attempts", firstScalarString(probe, ["attempts"]));
  setOptionalLabel(
    labels,
    "probe_latency_ms",
    firstScalarString(probe, ["latencyMs", "latency_ms"]),
  );
  const probeError = firstString(probe, ["error"]);
  setOptionalLabel(
    labels,
    "probe_error",
    probeError === undefined ? undefined : redactProbeError(probeError),
  );

  return labels;
}
