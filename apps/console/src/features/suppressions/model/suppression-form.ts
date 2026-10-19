import type { Suppression, SuppressionKind, SuppressionMatcher } from "@tocsin/core";

/**
 * Editable mirror of a suppression rule.
 *
 * The matcher is kept in its stored shape rather than a bespoke row model: a
 * suppression matcher is only ever edited as whole dimensions, so the extra
 * indirection route rules need (a row per stored entry) buys nothing here.
 */
export interface SuppressionFormValues {
  name: string;
  kind: SuppressionKind;
  reason: string;
  enabled: boolean;
  /** `datetime-local` strings; converted to ISO only on submit. */
  startsAt: string;
  endsAt: string;
  matcher: SuppressionMatcher;
}

export const suppressionKindValues: SuppressionKind[] = ["silence", "maintenance_window"];
export const suppressionSeverityValues: SuppressionMatcher["severities"] = [
  "critical",
  "warning",
  "info",
  "unknown",
];
export const suppressionStatusValues: SuppressionMatcher["statuses"] = [
  "firing",
  "resolved",
  "unknown",
];

export function emptySuppressionMatcher(): SuppressionMatcher {
  return {
    sourceIds: [],
    destinationIds: [],
    severities: [],
    statuses: [],
    fingerprints: [],
    labels: [],
    titleContains: [],
    messageContains: [],
  };
}

/**
 * A completely empty matcher silences everything in the window.
 *
 * Incomplete label rows count as empty: `suppressionMatcherFromValues` drops
 * them, so they must not make the confirmation look unnecessary for a rule that
 * will still be saved as "silence everything".
 */
export function suppressionMatcherIsEmpty(matcher: SuppressionMatcher): boolean {
  const normalized = suppressionMatcherFromValues(matcher);

  return (
    normalized.sourceIds.length === 0 &&
    normalized.destinationIds.length === 0 &&
    normalized.severities.length === 0 &&
    normalized.statuses.length === 0 &&
    normalized.fingerprints.length === 0 &&
    normalized.labels.length === 0 &&
    normalized.titleContains.length === 0 &&
    normalized.messageContains.length === 0
  );
}

/** Trims every entry and drops rows the operator left incomplete. */
export function suppressionMatcherFromValues(matcher: SuppressionMatcher): SuppressionMatcher {
  return {
    sourceIds: normalizeEntries(matcher.sourceIds),
    destinationIds: normalizeEntries(matcher.destinationIds),
    severities: [...matcher.severities],
    statuses: [...matcher.statuses],
    fingerprints: normalizeEntries(matcher.fingerprints),
    labels: matcher.labels
      .map((label) => ({
        key: label.key.trim(),
        operator: label.operator,
        value: label.value.trim(),
      }))
      .filter((label) => label.key.length > 0 && label.value.length > 0),
    titleContains: normalizeEntries(matcher.titleContains),
    messageContains: normalizeEntries(matcher.messageContains),
  };
}

export function suppressionFormDefaultsFromRule(rule: Suppression): SuppressionFormValues {
  return {
    name: rule.name,
    kind: rule.kind,
    reason: rule.reason ?? "",
    enabled: rule.enabled,
    startsAt: datetimeLocalFromIso(rule.startsAt),
    endsAt: datetimeLocalFromIso(rule.endsAt),
    matcher: {
      ...rule.matcher,
      sourceIds: [...rule.matcher.sourceIds],
      destinationIds: [...rule.matcher.destinationIds],
      severities: [...rule.matcher.severities],
      statuses: [...rule.matcher.statuses],
      fingerprints: [...rule.matcher.fingerprints],
      labels: rule.matcher.labels.map((label) => ({ ...label })),
      titleContains: [...rule.matcher.titleContains],
      messageContains: [...rule.matcher.messageContains],
    },
  };
}

/**
 * A create form starts with a window that is already open.
 *
 * `endsAt` gets a real value rather than an empty input because the owner ruling
 * made it non-nullable: an operator must pick an end, and a two-hour default is
 * the shortest window that still reads as "a maintenance window".
 */
export function defaultSuppressionWindow(now: Date = new Date()): {
  startsAt: string;
  endsAt: string;
} {
  const endsAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  return {
    startsAt: datetimeLocalFromDate(now),
    endsAt: datetimeLocalFromDate(endsAt),
  };
}

/**
 * Prefills the create form when the operator silences one event's fingerprint.
 *
 * Both the source and the fingerprint are set on purpose: fingerprints are only
 * unique within a provider, so silencing the fingerprint alone could mute a
 * different upstream system's alert that happens to share the same string.
 */
export function suppressionDefaultsFromEvent(input: {
  name: string;
  sourceId: string;
  fingerprint: string;
  now?: Date;
}): SuppressionFormValues {
  const window = defaultSuppressionWindow(input.now);

  return {
    name: input.name,
    kind: "silence",
    reason: "",
    enabled: true,
    startsAt: window.startsAt,
    endsAt: window.endsAt,
    matcher: {
      ...emptySuppressionMatcher(),
      sourceIds: [input.sourceId],
      fingerprints: [input.fingerprint],
    },
  };
}

/**
 * Prefills the create form when the operator silences one label value.
 *
 * The source is pinned for the same reason as the fingerprint variant: a label
 * such as `env=prod` exists across upstream systems, and the operator is
 * looking at one event from one source. The operator defaults to `equals`, the
 * narrowest match, so the prompt cannot widen what was clicked.
 */
export function suppressionDefaultsFromLabel(input: {
  name: string;
  sourceId: string;
  label: { key: string; value: string };
  now?: Date;
}): SuppressionFormValues {
  const window = defaultSuppressionWindow(input.now);

  return {
    name: input.name,
    kind: "silence",
    reason: "",
    enabled: true,
    startsAt: window.startsAt,
    endsAt: window.endsAt,
    matcher: {
      ...emptySuppressionMatcher(),
      sourceIds: [input.sourceId],
      labels: [{ key: input.label.key, operator: "equals", value: input.label.value }],
    },
  };
}

/** ISO instant → the local `datetime-local` value the input expects. */
export function datetimeLocalFromIso(iso: string): string {
  const date = new Date(iso);

  return Number.isNaN(date.getTime()) ? "" : datetimeLocalFromDate(date);
}

/** `datetime-local` value → ISO instant, or null when the input is not a date. */
export function isoFromDatetimeLocal(value: string): string | null {
  if (value.trim().length === 0) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function datetimeLocalFromDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function normalizeEntries(entries: string[]): string[] {
  return entries.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}
