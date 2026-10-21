import type { DeliveryState } from "@tocsin/core";

/**
 * Operational priority: a failed delivery needs attention first, an in-flight
 * one explains why the event looks quiet, and a suppressed one explains why
 * nothing was sent at all. Successful deliveries are the least urgent context.
 *
 * The summary health badges and the event delivery table share this order so a
 * single glance ranks the same state first in both places.
 */
export const DELIVERY_STATE_PRIORITY: readonly DeliveryState[] = [
  "failed",
  "running",
  "pending",
  "succeeded",
  "suppressed",
];

export function deliveryStatePriority(state: DeliveryState): number {
  const priority = DELIVERY_STATE_PRIORITY.indexOf(state);

  return priority === -1 ? DELIVERY_STATE_PRIORITY.length : priority;
}

/**
 * Stable sort: deliveries in the same state keep the order the server sent
 * (`created_at` ascending). Returns a new array; the input is left untouched.
 */
export function sortDeliveriesByOperationalPriority<T extends { state: DeliveryState }>(
  deliveries: readonly T[],
): T[] {
  return [...deliveries].sort(
    (left, right) => deliveryStatePriority(left.state) - deliveryStatePriority(right.state),
  );
}
