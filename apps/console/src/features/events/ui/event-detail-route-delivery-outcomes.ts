import type { DeliveryState } from "@tocsin/core";

import type { EventDetailData } from "#/features/events/ui/event-detail-types";

export type RouteDeliveryOutcomes = Partial<Record<DeliveryState, number>>;

/**
 * Delivery results keyed by route.
 *
 * The matches tab answers "did this route match, and what happened next?" in one
 * place, so it derives its counts from the very rows the deliveries tab shows.
 * A manual replay can enqueue deliveries with no route (`routeId: null`); those
 * belong to the delivery list, not to any route's match evidence, so they are
 * skipped rather than attributed to an arbitrary route.
 */
export function routeDeliveryOutcomes(
  deliveries: EventDetailData["deliveries"],
): Map<string, RouteDeliveryOutcomes> {
  const outcomes = new Map<string, RouteDeliveryOutcomes>();

  for (const delivery of deliveries) {
    if (!delivery.routeId) {
      continue;
    }

    const current = outcomes.get(delivery.routeId) ?? {};
    current[delivery.state] = (current[delivery.state] ?? 0) + 1;
    outcomes.set(delivery.routeId, current);
  }

  return outcomes;
}
