import type {
  DestinationKind,
  EventDetailDelivery,
  EventFingerprintFieldChange,
  EventFingerprintLabelChange,
  EventFingerprintOccurrence,
  JsonObject,
  NormalizedEvent,
} from "@tocsin/core";
import {
  decodeSchemaJson,
  EVENT_FINGERPRINT_CHANGE_FIELDS,
  LabelsSchema,
  parseFailureMetadataFrom,
  readProviderAlertCount,
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
 * Normalizes a list filter that takes one value or several.
 *
 * The console's multi-select sends an array, while links written before it
 * existed still carry a single value. Both become the same `IN` predicate, so
 * one selection cannot take a different code path from two. An empty array is
 * "no filter" rather than "match nothing": that is what the URL produces when
 * the operator clears every checkbox.
 */
export function filterValues<T>(value: T | T[] | undefined): T[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const values = Array.isArray(value) ? value : [value];
  return values.length > 0 ? values : undefined;
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

/**
 * Whether the list row is intake's audit event for a payload a provider parser
 * rejected.
 *
 * Reads the same `parseFailed` marker the detail notice reads, and tolerates a
 * corrupt `provider_metadata_json`: one damaged row must not fail the whole
 * event list. A value that cannot be parsed simply is not a parse-failure row.
 */
export function isParseFailureRow(providerMetadataJson: string): boolean {
  return parseFailureMetadataFrom(decodeJsonTolerantly(providerMetadataJson)) !== null;
}

/**
 * The upstream alert-group size recorded in provider metadata, or `null`.
 *
 * Alertmanager-compatible providers send one notification per alert group and
 * Tocsin normalizes only its first alert, so the list needs the group size to
 * avoid showing a twenty-alert outage as a single ordinary event. A corrupt or
 * non-object blob reads as "no count" for the same reason `isParseFailureRow`
 * tolerates it: one damaged row must not fail the whole list.
 */
export function alertCountFrom(providerMetadataJson: string): number | null {
  const metadata = decodeJsonTolerantly(providerMetadataJson);

  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return readProviderAlertCount(metadata as JsonObject) ?? null;
}

function decodeJsonTolerantly(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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
