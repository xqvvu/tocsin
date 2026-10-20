import type { DeliveryDetail, DeliveryJob, JsonObject, NormalizedEvent } from "@tocsin/core";

type DeliveryDetailData = NonNullable<DeliveryDetail>;

/**
 * Why a delivery has no urgent phone pings.
 *
 * Automatic paging is a chain of silent gates in `OncallService`: Feishu app
 * mode, a succeeded send that returned a message reference, auto-enabled
 * paging, configured receivers, a firing alert, and a matching severity.
 * Deduplication can also drop every receiver. A bare "no urgent calls" row
 * reads like a broken feature, so the detail page derives one reason from the
 * delivery and the destination metadata. This is a read-only projection: it
 * never re-triggers paging or changes its semantics.
 */
export type MissingUrgentPingReason =
  | { code: "not_feishu" }
  | { code: "delivery_not_succeeded"; state: DeliveryJob["state"] }
  | { code: "webhook_mode" }
  | { code: "no_provider_reference" }
  | { code: "auto_disabled" }
  | { code: "no_receivers" }
  | { code: "not_firing"; status: NormalizedEvent["status"] }
  | { code: "severity_excluded"; severity: NormalizedEvent["severity"]; severities: string[] }
  | { code: "not_created" };

/**
 * The destination metadata is read live, so the explanation describes the
 * current configuration rather than a snapshot taken at send time. Pings that
 * do exist are the authority: this function returns null as soon as there is
 * one.
 */
export function explainMissingUrgentPings(
  detail: DeliveryDetailData,
): MissingUrgentPingReason | null {
  if (detail.pings.length > 0) {
    return null;
  }

  if (detail.destination.kind !== "feishu") {
    return { code: "not_feishu" };
  }

  if (detail.job.state !== "succeeded") {
    return { code: "delivery_not_succeeded", state: detail.job.state };
  }

  const metadata = detail.destinationMetadata;

  if (metadataString(metadata, "sendMode") !== "app") {
    return { code: "webhook_mode" };
  }

  // Auto paging quotes the message the send returned. Without a reference the
  // trigger is skipped even though the delivery itself succeeded.
  if (!detail.providerReference) {
    return { code: "no_provider_reference" };
  }

  if (metadataBoolean(metadata, "urgentAutoEnabled") !== true) {
    return { code: "auto_disabled" };
  }

  if ((metadataNumber(metadata, "urgentReceiverCount") ?? 0) <= 0) {
    return { code: "no_receivers" };
  }

  const status = detail.event.normalized.status;

  if (status !== "firing") {
    return { code: "not_firing", status };
  }

  // `urgentSeverities` is `[]` only when the destination has no urgent block
  // (already reported as `no_receivers` above). A block with an empty stored
  // list is projected as ["critical"], matching the adapter schema and the
  // trigger, so the explanation cannot disagree with what actually ran.
  const severities = metadataStringArray(metadata, "urgentSeverities");
  const severity = detail.event.normalized.severity;

  if (severities.length > 0 && !severities.includes(severity)) {
    return { code: "severity_excluded", severity, severities };
  }

  // Every gate passed but no ping exists: the dedupe window swallowed the
  // receivers, or the trigger failed after the delivery was already marked
  // succeeded (it logs a warning and does not retry).
  return { code: "not_created" };
}

function metadataString(metadata: JsonObject, key: string): string | null {
  const value = metadata[key];

  return typeof value === "string" ? value : null;
}

function metadataBoolean(metadata: JsonObject, key: string): boolean | null {
  const value = metadata[key];

  return typeof value === "boolean" ? value : null;
}

function metadataNumber(metadata: JsonObject, key: string): number | null {
  const value = metadata[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metadataStringArray(metadata: JsonObject, key: string): string[] {
  const value = metadata[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}
