import { evaluateRouteMatch, type DeliveryDetail, type RouteMatchResult } from "@tocsin/core";

/**
 * A delivery records the route that selected it, but not *why* that route
 * matched: the evidence lives on the event's intake snapshot. The route
 * definition is read live, so the two can disagree after an operator edits the
 * rule. Resolving both sides in one pure function keeps the UI from presenting
 * today's rule as the explanation for a past delivery.
 */
export interface DeliveryRouteEvidence {
  /** The intake snapshot's verdict for this route, when the snapshot covered it. */
  snapshot: RouteMatchResult | null;
  /** Whether the event carries any intake snapshot at all. */
  hasSnapshot: boolean;
  /** Evaluation against the route as it stands now; null when the route is gone. */
  current: RouteMatchResult | null;
}

export function buildDeliveryRouteEvidence(detail: DeliveryDetail): DeliveryRouteEvidence | null {
  const routeId = detail.job.routeId;

  // Manual deliveries bypass routing entirely; there is nothing to explain.
  if (!routeId) {
    return null;
  }

  const matches = detail.event.routeMatches;

  return {
    snapshot: matches?.find((match) => match.routeId === routeId) ?? null,
    hasSnapshot: matches != null,
    current: detail.route
      ? evaluateRouteMatch(detail.route, {
          sourceId: detail.event.sourceId,
          event: detail.event.normalized,
        })
      : null,
  };
}
