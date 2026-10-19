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

export interface ActiveSuppressionSummary {
  activeCount: number;
  /** Active rules whose matcher has no conditions and therefore silences everything. */
  catchAllCount: number;
  names: string[];
}

/**
 * Project the rules that are in force at `now`.
 *
 * Only `active` counts: a scheduled rule has not started, an expired one can no
 * longer silence, and a disabled one is intentionally off. `catchAllCount` is
 * reported separately because an unconditional rule is the case that makes the
 * rest of the console look healthy while nothing is delivered.
 */
export function summarizeActiveSuppressions(
  suppressions: readonly Suppression[],
  now: string,
): ActiveSuppressionSummary {
  const active = suppressions.filter(
    (suppression) => suppressionStateAt(suppression, now) === "active",
  );

  return {
    activeCount: active.length,
    catchAllCount: active.filter((suppression) =>
      isUnconditionalSuppressionMatcher(suppression.matcher),
    ).length,
    names: active.map((suppression) => suppression.name),
  };
}
