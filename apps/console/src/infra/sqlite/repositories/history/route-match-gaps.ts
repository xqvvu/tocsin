import type { RouteMatchGap, RouteMatchGapReason, RouteMatchResult } from "@tocsin/core";

/** The slice of a delivery row this judgement needs. */
export interface DeliveryPresence {
  routeId: string | null;
  destinationId: string;
}

/** A destination as it exists now, or null if it never did / no longer does. */
export interface DestinationPresence {
  id: string;
  name: string;
  enabled: boolean;
}

/** A route as it exists now, or absent if it was deleted. */
export interface RoutePresence {
  id: string;
  enabled: boolean;
}

export interface RouteMatchGapInput {
  /** Route match results, from the intake snapshot or recomputed on read. */
  matches: RouteMatchResult[];
  /** Deliveries that DO exist for this event. */
  deliveries: DeliveryPresence[];
  /** Every route currently defined. A snapshot route absent here was deleted. */
  routes: RoutePresence[];
  /** Every destination currently defined. */
  destinations: DestinationPresence[];
  /**
   * Dedupe rows still inside the window, keyed `routeId|destinationId`, valued
   * with the event that was delivered instead. Empty once pruned — which is the
   * whole reason `duplicate_within_window` decays into `unknown`.
   */
  dedupeFirstEvents: Map<string, string>;
}

export function deliveryTargetKey(routeId: string, destinationId: string): string {
  return `${routeId}|${destinationId}`;
}

/**
 * Explain every (route, destination) the snapshot says matched but which has no
 * delivery.
 *
 * Ordered short-circuit, mirroring the boundary document: a route that no
 * longer exists cannot also be "just disabled", and reporting both would be a
 * contradiction. Only rows whose `matched` is true AND whose destination the
 * match actually selected are considered — a route that matched with no
 * destinations has nothing to explain.
 *
 * Pure and total: it never throws, and an unexplainable pair yields `unknown`
 * rather than being dropped. Silence would read as "no gap", which is the one
 * thing this must not do.
 */
export function routeMatchGaps(input: RouteMatchGapInput): RouteMatchGap[] {
  const existingTargets = new Set(
    input.deliveries
      .filter(
        (delivery): delivery is { routeId: string; destinationId: string } =>
          delivery.routeId !== null,
      )
      .map((delivery) => deliveryTargetKey(delivery.routeId, delivery.destinationId)),
  );

  const routesById = new Map(input.routes.map((route) => [route.id, route]));
  const destinationsById = new Map(
    input.destinations.map((destination) => [destination.id, destination]),
  );

  const gaps: RouteMatchGap[] = [];

  for (const match of input.matches) {
    if (!match.matched) {
      continue;
    }

    const route = routesById.get(match.routeId);

    // Route-level reasons first, and emitted ONCE for the whole route.
    // A deleted route leaves every one of its destinations undelivered, so
    // reporting per destination would repeat the same sentence three times and
    // bury the pair-level gaps that actually differ from one another.
    const routeLevelReason = routeLevelGapReason(route);

    if (routeLevelReason) {
      gaps.push({
        routeId: match.routeId,
        routeName: match.routeName,
        destinationId: null,
        destinationName: null,
        reason: routeLevelReason,
        firstEventId: null,
      });

      continue;
    }

    for (const destinationId of match.destinationIds) {
      const key = deliveryTargetKey(match.routeId, destinationId);

      if (existingTargets.has(key)) {
        continue;
      }

      const destination = destinationsById.get(destinationId) ?? null;
      const firstEventId = input.dedupeFirstEvents.get(key) ?? null;

      gaps.push({
        routeId: match.routeId,
        routeName: match.routeName,
        destinationId,
        destinationName: destination?.name ?? null,
        reason: classify({ destination, firstEventId }),
        firstEventId,
      });
    }
  }

  return gaps;
}

/** The reason that condemns a whole route, if any. */
function routeLevelGapReason(route: RoutePresence | undefined): RouteMatchGapReason | null {
  // Deleted first: its deliveries cascade away, so "no delivery row" would
  // otherwise look identical to a route that never fired.
  if (!route) {
    return "route_deleted";
  }

  return route.enabled ? null : "route_disabled";
}

function classify(input: {
  destination: DestinationPresence | null;
  firstEventId: string | null;
}): RouteMatchGapReason {
  if (!input.destination) {
    return "destination_missing";
  }

  if (!input.destination.enabled) {
    return "destination_disabled";
  }

  // Still inside the dedupe window and the row survives: name the event that
  // won. Past the window it is pruned and this becomes unknowable — which is
  // exactly why `unknown` has to exist as a first-class answer.
  if (input.firstEventId) {
    return "duplicate_within_window";
  }

  return "unknown";
}
