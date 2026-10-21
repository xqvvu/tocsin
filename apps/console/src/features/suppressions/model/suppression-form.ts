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
  /**
   * `datetime-local` wall clocks in the console time zone; converted to ISO
   * only on submit. The input has no zone of its own, and the console renders
   * every other timestamp in the configured zone, so the two must agree.
   */
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

export function suppressionFormDefaultsFromRule(
  rule: Suppression,
  timeZone: string,
): SuppressionFormValues {
  return {
    name: rule.name,
    kind: rule.kind,
    reason: rule.reason ?? "",
    enabled: rule.enabled,
    startsAt: datetimeLocalFromIso(rule.startsAt, timeZone),
    endsAt: datetimeLocalFromIso(rule.endsAt, timeZone),
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
export function defaultSuppressionWindow(
  timeZone: string,
  now: Date = new Date(),
): {
  startsAt: string;
  endsAt: string;
} {
  const endsAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  return {
    startsAt: datetimeLocalFromDate(now, timeZone),
    endsAt: datetimeLocalFromDate(endsAt, timeZone),
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
  timeZone: string;
  now?: Date;
}): SuppressionFormValues {
  const window = defaultSuppressionWindow(input.timeZone, input.now);

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
  timeZone: string;
  now?: Date;
}): SuppressionFormValues {
  const window = defaultSuppressionWindow(input.timeZone, input.now);

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

/**
 * Prefills the create form when the operator silences by a text fragment.
 *
 * The matcher compares a case-insensitive substring
 * (`packages/core/src/route/route.ts:314-334`), so the clicked text is stored
 * verbatim. The source is pinned for the same reason as the fingerprint and
 * label variants: the same title can arrive from several upstream systems.
 *
 * Callers must pass a non-empty value. An empty needle is dropped by
 * `suppressionMatcherFromValues`, which would silently turn the rule into
 * "silence everything from this source"; the event detail UI disables the
 * action instead.
 */
export function suppressionDefaultsFromText(input: {
  name: string;
  sourceId: string;
  field: "title" | "message";
  value: string;
  timeZone: string;
  now?: Date;
}): SuppressionFormValues {
  const window = defaultSuppressionWindow(input.timeZone, input.now);
  const needle = input.value.trim();

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
      titleContains: input.field === "title" ? [needle] : [],
      messageContains: input.field === "message" ? [needle] : [],
    },
  };
}

/**
 * ISO instant → the `datetime-local` wall clock shown in `timeZone`.
 *
 * `new Date(iso)` + `getHours()` would use the browser zone, which is not
 * necessarily the zone the console renders timestamps in. A window typed as
 * 10:00 then reappeared as 02:00 in the list whenever the two differed.
 */
export function datetimeLocalFromIso(iso: string, timeZone: string): string {
  const instant = Date.parse(iso);

  return Number.isNaN(instant) ? "" : datetimeLocalFromDate(new Date(instant), timeZone);
}

/**
 * `datetime-local` wall clock → ISO instant, interpreted in `timeZone`.
 *
 * Returns `null` for empty, malformed, or impossible values (for example
 * `2026-02-31T10:00`) so the form reports an invalid window instead of silently
 * saving a normalized date the operator never typed.
 */
export function isoFromDatetimeLocal(value: string, timeZone: string): string | null {
  const wallClock = parseWallClock(value);

  if (wallClock === null) {
    return null;
  }

  const instantMs = instantFromWallClock(wallClock, timeZone);
  const roundTrip = wallClockAt(instantMs, timeZone);

  // A wall clock inside a DST spring-forward gap has no instant. Reject it
  // instead of silently saving the neighbouring hour the operator never typed.
  const exists =
    roundTrip.year === wallClock.year &&
    roundTrip.month === wallClock.month &&
    roundTrip.day === wallClock.day &&
    roundTrip.hour === wallClock.hour &&
    roundTrip.minute === wallClock.minute &&
    roundTrip.second === wallClock.second;

  return exists ? new Date(instantMs).toISOString() : null;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const WALL_CLOCK_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const wallClockFormatters = new Map<string, Intl.DateTimeFormat>();

function datetimeLocalFromDate(date: Date, timeZone: string): string {
  return formatWallClock(wallClockAt(date.getTime(), timeZone));
}

function formatWallClock(wallClock: WallClock): string {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${wallClock.year}-${pad(wallClock.month)}-${pad(wallClock.day)}T${pad(
    wallClock.hour,
  )}:${pad(wallClock.minute)}`;
}

function parseWallClock(value: string): WallClock | null {
  const match = WALL_CLOCK_PATTERN.exec(value.trim());

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);

  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  // `Date.UTC` rolls impossible days forward (Feb 31 → Mar 3); reject those so
  // the operator's typo cannot become a real window.
  const probe = new Date(Date.UTC(year, month - 1, day));

  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day, hour, minute, second };
}

function wallClockAt(instantMs: number, timeZone: string): WallClock {
  let formatter = wallClockFormatters.get(timeZone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      second: "2-digit",
      timeZone,
      year: "numeric",
    });
    wallClockFormatters.set(timeZone, formatter);
  }

  const parts = formatter.formatToParts(new Date(instantMs));
  const read = (type: "year" | "month" | "day" | "hour" | "minute" | "second") =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    // Some engines still report 24 for midnight under h23; normalize it.
    hour: read("hour") % 24,
    minute: read("minute"),
    second: read("second"),
  };
}

/** How far ahead of UTC `timeZone` is at `instantMs`, in milliseconds. */
function timeZoneOffsetMs(instantMs: number, timeZone: string): number {
  const wallClock = wallClockAt(instantMs, timeZone);

  return (
    Date.UTC(
      wallClock.year,
      wallClock.month - 1,
      wallClock.day,
      wallClock.hour,
      wallClock.minute,
      wallClock.second,
    ) - instantMs
  );
}

function instantFromWallClock(wallClock: WallClock, timeZone: string): number {
  const wallClockAsUtc = Date.UTC(
    wallClock.year,
    wallClock.month - 1,
    wallClock.day,
    wallClock.hour,
    wallClock.minute,
    wallClock.second,
  );
  // The offset depends on the instant, so measure it once at the naive instant
  // and again at the candidate. One correction settles DST boundaries; for the
  // ambiguous hour it picks the earlier offset, and for a skipped hour it lands
  // on the instant the clock jumped to.
  const firstOffset = timeZoneOffsetMs(wallClockAsUtc, timeZone);
  const candidate = wallClockAsUtc - firstOffset;
  const secondOffset = timeZoneOffsetMs(candidate, timeZone);

  return secondOffset === firstOffset ? candidate : wallClockAsUtc - secondOffset;
}

function normalizeEntries(entries: string[]): string[] {
  return entries.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}
