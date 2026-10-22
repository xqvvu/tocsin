import type { SourceSummary, SuppressionMatcher } from "@tocsin/core";

export interface SuppressionScopeSource {
  id: string;
  /**
   * Null when the rule still references a source that has been deleted. The
   * alert column keeps the id so the operator can see what the rule points at.
   */
  name: string | null;
  enabled: boolean;
}

export interface SuppressionScopeSummary {
  /** Sources the rule is pinned to; an empty list means every source. */
  sources: SuppressionScopeSource[];
  severities: SuppressionMatcher["severities"];
  statuses: SuppressionMatcher["statuses"];
  /**
   * Fingerprint, label, title and message conditions narrow the match further.
   * The panel only announces that they exist: listing every value would just
   * duplicate the form inputs immediately above it.
   */
  hasTextConditions: boolean;
}

/**
 * The alert-side scope of a suppression, for the consent panel shown before
 * save (PRD §2.3 safety guard).
 *
 * `destinationIds` is deliberately absent: the destination scope is already
 * disclosed by `urgentImpactPreview`, which knows whether those targets page.
 * An empty dimension means "unrestricted", matching
 * `SuppressionMatcherSchema` defaults.
 */
export function suppressionScopeSummary(
  sources: SourceSummary[],
  matcher: SuppressionMatcher,
): SuppressionScopeSummary {
  const sourcesById = new Map(sources.map((source) => [source.id, source]));

  return {
    sources: matcher.sourceIds.map((id) => {
      const source = sourcesById.get(id);
      return { id, name: source?.name ?? null, enabled: source?.enabled ?? false };
    }),
    severities: matcher.severities,
    statuses: matcher.statuses,
    hasTextConditions:
      matcher.fingerprints.length > 0 ||
      matcher.labels.length > 0 ||
      matcher.titleContains.length > 0 ||
      matcher.messageContains.length > 0,
  };
}
