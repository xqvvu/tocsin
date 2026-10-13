import type { DestinationListItem, SuppressionMatcher } from "@tocsin/core";

export interface UrgentImpactDestination {
  id: string;
  name: string;
}

export interface UrgentImpactPreview {
  /**
   * Enabled destinations inside the rule's scope that page automatically. These
   * are the ones whose alerts would go quiet *and* stay silent, so the operator
   * has to consent to them explicitly (PRD §2.3 story 19).
   */
  destinations: UrgentImpactDestination[];
  /** All enabled destinations inside the scope, paging or not. */
  scopedCount: number;
}

/**
 * Which destinations a suppression would mute calls for.
 *
 * Only `destinationIds` narrows the destination set: the other dimensions match
 * attributes of an alert, so they cannot exclude a destination from the scope
 * without knowing which event arrives. Disabled destinations are left out
 * because they cannot deliver anything, and therefore cannot page.
 *
 * An empty `destinationIds` means "every destination", which is exactly the
 * situation the preview exists for.
 */
export function urgentImpactPreview(
  destinations: DestinationListItem[],
  matcher: SuppressionMatcher,
): UrgentImpactPreview {
  const scopedIds = new Set(matcher.destinationIds);
  const scoped = destinations.filter(
    (destination) => destination.enabled && (scopedIds.size === 0 || scopedIds.has(destination.id)),
  );

  return {
    destinations: scoped
      .filter((destination) => destination.operationalConfig.urgentAutoEnabled === true)
      .map((destination) => ({ id: destination.id, name: destination.name })),
    scopedCount: scoped.length,
  };
}
