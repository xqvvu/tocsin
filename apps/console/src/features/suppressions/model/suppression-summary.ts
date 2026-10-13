import type { SuppressionMatcher } from "@tocsin/core";

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
