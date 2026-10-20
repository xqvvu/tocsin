import {
  redactJsonText,
  type DeliveryDetail,
  type EventDetail,
  type JsonValue,
} from "@tocsin/core";

/**
 * Version of the exported evidence document.
 *
 * Bump this when a field is renamed or removed. Additive fields do not need a
 * bump: the bundle is a superset of the detail DTOs the dashboard already
 * renders, and readers are expected to ignore unknown fields.
 */
export const EVIDENCE_BUNDLE_SCHEMA_VERSION = 1;

export type EvidenceBundleKind = "event" | "delivery";

/**
 * Self-contained JSON an operator can attach to an incident ticket or hand to
 * a second pair of eyes.
 *
 * The subject sits at the top level so a reader does not have to know whether
 * this is an event or a delivery bundle before finding the id. The nested
 * `event`/`delivery` documents are the same DTOs the detail page renders.
 */
export interface EvidenceBundle {
  schemaVersion: number;
  kind: EvidenceBundleKind;
  subjectId: string;
  exportedAt: string;
  event?: EventDetail;
  delivery?: DeliveryDetail;
}

export interface EvidenceBundleOptions {
  /** Injected clock so tests and audit trails get a deterministic timestamp. */
  now?: Date;
}

export function buildEventEvidenceBundle(
  detail: EventDetail,
  options: EvidenceBundleOptions = {},
): EvidenceBundle {
  return redactBundle({
    schemaVersion: EVIDENCE_BUNDLE_SCHEMA_VERSION,
    kind: "event",
    subjectId: detail.event.id,
    exportedAt: exportTimestamp(options.now),
    event: detail,
  });
}

export function buildDeliveryEvidenceBundle(
  detail: DeliveryDetail,
  options: EvidenceBundleOptions = {},
): EvidenceBundle {
  return redactBundle({
    schemaVersion: EVIDENCE_BUNDLE_SCHEMA_VERSION,
    kind: "delivery",
    subjectId: detail.job.id,
    exportedAt: exportTimestamp(options.now),
    delivery: detail,
  });
}

/**
 * Pretty-printed JSON with a trailing newline, so the file opens cleanly in
 * editors and diffs well when two exports are compared.
 */
export function serializeEvidenceBundle(bundle: EvidenceBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

/**
 * Stable, filesystem-safe name: `tocsin-event-<id>-<UTC timestamp>.json`.
 *
 * The timestamp comes from `exportedAt`, so repeated downloads of the same
 * record do not overwrite each other and the file sorts chronologically.
 */
export function evidenceBundleFilename(bundle: EvidenceBundle): string {
  const subject = bundle.subjectId.replaceAll(/[^A-Za-z0-9_-]/g, "-");
  return `tocsin-${bundle.kind}-${subject}-${compactTimestamp(bundle.exportedAt)}.json`;
}

function exportTimestamp(now: Date | undefined): string {
  return (now ?? new Date()).toISOString();
}

function compactTimestamp(iso: string): string {
  return iso.replaceAll(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * Redacts the whole document again before it leaves the browser.
 *
 * The detail DTOs are already redacted at the read boundary, and this second
 * pass is deliberately idempotent. It covers two cases the first pass cannot:
 * a future field added to a DTO without the matching server projection, and a
 * credential pasted into a title or error message that only value-shape rules
 * catch. The JSON round-trip also turns class instances and `undefined` into
 * plain JSON, so nothing in the file is outside the redaction walk.
 */
function redactBundle(bundle: EvidenceBundle): EvidenceBundle {
  const plain = JSON.parse(JSON.stringify(bundle)) as JsonValue;

  return redactJsonText(plain) as unknown as EvidenceBundle;
}
