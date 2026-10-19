import {
  evaluateRouteMatch,
  REDACTED_VALUE,
  type DeliveryDetail,
  type NormalizedEvent,
  type RouteMatchResult,
} from "@tocsin/core";

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
  /**
   * True when the event content was projected for display, so recomputing the
   * current rule would compare against `[REDACTED]` instead of the input the
   * rule was written for. The evidence then falls back to the intake snapshot.
   */
  currentRedacted: boolean;
}

export function buildDeliveryRouteEvidence(detail: DeliveryDetail): DeliveryRouteEvidence | null {
  const routeId = detail.job.routeId;

  // Manual deliveries bypass routing entirely; there is nothing to explain.
  if (!routeId) {
    return null;
  }

  const matches = detail.event.routeMatches;
  const redacted = containsRedactedValue(detail.event.normalized);

  return {
    snapshot: matches?.find((match) => match.routeId === routeId) ?? null,
    hasSnapshot: matches != null,
    current:
      detail.route && !redacted
        ? evaluateRouteMatch(detail.route, {
            sourceId: detail.event.sourceId,
            event: detail.event.normalized,
          })
        : null,
    currentRedacted: detail.route !== null && redacted,
  };
}

function containsRedactedValue(event: NormalizedEvent): boolean {
  return (
    event.title.includes(REDACTED_VALUE) ||
    event.message.includes(REDACTED_VALUE) ||
    Object.values(event.labels).some((value) => value.includes(REDACTED_VALUE))
  );
}
