import { isUnconditionalSuppressionMatcher, suppressionStateAt } from "@tocsin/core";
import type { Suppression, SuppressionMatcher } from "@tocsin/core";

/**
 * Locale-agnostic copy and formatters for suppression matcher chips.
 * Callers supply translated strings; this module never imports i18n runtime.
 */
export interface SuppressionSummaryCopy {
  /** Shown when the matcher has no conditions at all. */
  everything: string;
  source: string;
  destination: string;
  severity: string;
  status: string;
  fingerprint: string;
  labels: string;
  titleContains: string;
  messageContains: string;
  severityLabel: (severity: SuppressionMatcher["severities"][number]) => string;
  statusLabel: (status: SuppressionMatcher["statuses"][number]) => string;
}

export function buildSuppressionMatcherChips(
  matcher: SuppressionMatcher,
  nameFor: { source: (sourceId: string) => string; destination: (destinationId: string) => string },
  copy: SuppressionSummaryCopy,
): string[] {
  return [
    ...matcher.sourceIds.map((sourceId) => `${copy.source}: ${nameFor.source(sourceId)}`),
    ...matcher.destinationIds.map(
      (destinationId) => `${copy.destination}: ${nameFor.destination(destinationId)}`,
    ),
    ...matcher.severities.map((severity) => `${copy.severity}: ${copy.severityLabel(severity)}`),
    ...matcher.statuses.map((status) => `${copy.status}: ${copy.statusLabel(status)}`),
    ...matcher.fingerprints.map((fingerprint) => `${copy.fingerprint}: ${fingerprint}`),
    ...matcher.labels.map((label) =>
      label.operator === "equals"
        ? `${copy.labels}: ${label.key}=${label.value}`
        : `${copy.labels}: ${label.key}~${label.value}`,
    ),
    ...matcher.titleContains.map((value) => `${copy.titleContains}: ${value}`),
    ...matcher.messageContains.map((value) => `${copy.messageContains}: ${value}`),
  ];
}

/** Tooltip / aria summary of a matcher; the empty matcher reads as "everything". */
export function describeSuppressionMatcher(chips: string[], copy: SuppressionSummaryCopy): string {
  return chips.length === 0 ? copy.everything : chips.join("; ");
}

/**
 * How long before `endsAt` a rule is flagged as about to expire.
 *
 * Thirty minutes is long enough to extend a maintenance window before alerts
 * resume, and short enough that the flag does not sit on screen all day.
 */
export const SUPPRESSION_EXPIRING_SOON_MS = 30 * 60_000;

export interface ActiveSuppressionSummary {
  activeCount: number;
  /** Active rules whose matcher has no conditions and therefore silences everything. */
  catchAllCount: number;
  /** Active rules whose window ends within `SUPPRESSION_EXPIRING_SOON_MS` of `now`. */
  expiringSoonCount: number;
  names: string[];
}

/**
 * Project the rules that are in force at `now`.
 *
 * Only `active` counts: a scheduled rule has not started, an expired one can no
 * longer silence, and a disabled one is intentionally off. `catchAllCount` is
 * reported separately because an unconditional rule is the case that makes the
 * rest of the console look healthy while nothing is delivered.
 * `expiringSoonCount` is the other half of that honesty: an active rule is not
 * permanent, and its end is when delivery resumes.
 */
export function summarizeActiveSuppressions(
  suppressions: readonly Suppression[],
  now: string,
): ActiveSuppressionSummary {
  const active = suppressions.filter(
    (suppression) => suppressionStateAt(suppression, now) === "active",
  );
  const nowMs = Date.parse(now);

  return {
    activeCount: active.length,
    catchAllCount: active.filter((suppression) =>
      isUnconditionalSuppressionMatcher(suppression.matcher),
    ).length,
    // An unparsable clock is already handled by the state fallback; do not also
    // claim a rule is about to expire on evidence we could not read.
    expiringSoonCount: Number.isNaN(nowMs)
      ? 0
      : active.filter((suppression) => endsWithin(suppression.endsAt, nowMs)).length,
    names: active.map((suppression) => suppression.name),
  };
}

function endsWithin(endsAt: string, nowMs: number): boolean {
  const endsAtMs = Date.parse(endsAt);

  return !Number.isNaN(endsAtMs) && endsAtMs - nowMs <= SUPPRESSION_EXPIRING_SOON_MS;
}
