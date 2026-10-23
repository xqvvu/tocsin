import type {
  DestinationKind,
  EventDetailDelivery,
  EventFingerprintFieldChange,
  EventFingerprintLabelChange,
  EventFingerprintOccurrence,
  NormalizedEvent,
} from "@tocsin/core";
import {
  decodeSchemaJson,
  EVENT_FINGERPRINT_CHANGE_FIELDS,
  LabelsSchema,
  redactNormalizedEvent,
} from "@tocsin/core";

import {
  deliveryFromRow,
  providerReferenceFromRow,
} from "#/infra/sqlite/repositories/delivery/delivery.helpers";
import type {
  DeliveryAttemptRow,
  DeliveryRow,
} from "#/infra/sqlite/repositories/delivery/delivery.interface";

export interface EventDetailDeliveryRow extends DeliveryRow {
  destination_name: string;
  destination_kind: DestinationKind | null;
  route_name: string | null;
}

/**
 * The most recent completed attempt per delivery, projected into the event
 * detail delivery. Passed in rather than queried per row so the detail page
 * keeps a fixed query count.
 */
export type EventDetailLatestAttempt = Pick<DeliveryAttemptRow, "response_status" | "finished_at">;

export function eventDetailDeliveryFromRow(
  row: EventDetailDeliveryRow,
  latestAttempt: EventDetailLatestAttempt | null = null,
): EventDetailDelivery {
  return {
    ...deliveryFromRow(row),
    destinationName: row.destination_name,
    destinationKind: row.destination_kind ?? undefined,
    routeName: row.route_name,
    providerReference: providerReferenceFromRow(row),
    lastResponseStatus: latestAttempt?.response_status ?? null,
    lastResponseAt: latestAttempt?.finished_at ?? null,
  };
}

/** The `events` columns the fingerprint comparison reads. */
export interface FingerprintEventRow {
  id: string;
  title: string;
  message: string;
  severity: NormalizedEvent["severity"];
  status: NormalizedEvent["status"];
  labels_json: string;
  fingerprint: string;
  received_at: string;
}

/**
 * One event's comparison fields after the read-boundary redaction rules.
 *
 * The current event and its earlier occurrences go through the same function
 * so the diff compares like with like: a credential redacted in both rows must
 * not look like a change.
 */
export interface RedactedFingerprintFields {
  id: string;
  severity: NormalizedEvent["severity"];
  status: NormalizedEvent["status"];
  title: string;
  message: string;
  labels: Record<string, string>;
  receivedAt: string;
}

export function redactedFingerprintFields(row: FingerprintEventRow): RedactedFingerprintFields {
  const redacted = redactNormalizedEvent({
    title: row.title,
    message: row.message,
    labels: decodeSchemaJson(LabelsSchema, row.labels_json),
    severity: row.severity,
    status: row.status,
    fingerprint: row.fingerprint,
    occurredAt: row.received_at,
  });

  return {
    id: row.id,
    severity: redacted.severity,
    status: redacted.status,
    title: redacted.title,
    message: redacted.message,
    labels: redacted.labels,
    receivedAt: row.received_at,
  };
}

export function fingerprintOccurrence(
  fields: RedactedFingerprintFields,
): EventFingerprintOccurrence {
  return {
    id: fields.id,
    severity: fields.severity,
    status: fields.status,
    title: fields.title,
    receivedAt: fields.receivedAt,
  };
}

/**
 * What differs between the current event and its previous occurrence.
 *
 * Only the fields an operator can act on are compared; fingerprint and event
 * time differ by definition. Labels are compared key by key so an addition and
 * a removal are distinguishable from a value change — `null` means "absent",
 * never "empty string", because an empty label value is dropped at parse time.
 */
export function fingerprintChangesFrom(
  previous: RedactedFingerprintFields | null,
  current: RedactedFingerprintFields,
): {
  fieldChanges: EventFingerprintFieldChange[];
  labelChanges: EventFingerprintLabelChange[];
} {
  if (!previous) {
    return { fieldChanges: [], labelChanges: [] };
  }

  const fieldChanges: EventFingerprintFieldChange[] = [];

  for (const field of EVENT_FINGERPRINT_CHANGE_FIELDS) {
    if (previous[field] !== current[field]) {
      fieldChanges.push({ field, previous: previous[field], current: current[field] });
    }
  }

  const labelKeys = [
    ...new Set([...Object.keys(previous.labels), ...Object.keys(current.labels)]),
  ].sort();
  const labelChanges: EventFingerprintLabelChange[] = [];

  for (const key of labelKeys) {
    const before = previous.labels[key] ?? null;
    const after = current.labels[key] ?? null;

    if (before !== after) {
      labelChanges.push({ key, previous: before, current: after });
    }
  }

  return { fieldChanges, labelChanges };
}

export function encodeHistoryCursor(time: string, id: string): string {
  return `${encodeURIComponent(time)}|${encodeURIComponent(id)}`;
}

export function decodeHistoryCursor(cursor: string): { time: string; id: string | null } {
  const [time, id] = cursor.split("|", 2);

  if (!time) {
    return { time: cursor, id: null };
  }

  return {
    time: decodeURIComponent(time),
    id: id ? decodeURIComponent(id) : null,
  };
}
