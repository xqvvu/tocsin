import type { OperationFilterData } from "#/features/operations/model/operation-search";
import { orpc } from "#/lib/orpc";

export const operationsQueryKeys = {
  all: ["operations"] as const,
  list: (filters: OperationFilterData) =>
    [...operationsQueryKeys.all, "list", normalizeOperationFilters(filters)] as const,
  eventDetail: (eventId: string) => [...operationsQueryKeys.all, "events", "detail", eventId],
  eventFingerprintContext: (eventId: string) => [
    ...operationsQueryKeys.all,
    "events",
    "fingerprint-context",
    eventId,
  ],
  eventReplayPreview: (eventId: string) => [
    ...operationsQueryKeys.all,
    "events",
    "replay-preview",
    eventId,
  ],
  routeReplayPreview: (routeId: string) => [
    ...operationsQueryKeys.all,
    "routes",
    "replay-preview",
    routeId,
  ],
  deliveryDetail: (deliveryId: string) => [
    ...operationsQueryKeys.all,
    "deliveries",
    "detail",
    deliveryId,
  ],
  deliveryBacklog: () => [...operationsQueryKeys.all, "deliveries", "backlog"] as const,
};

/** The configuration row a queued-delivery count is scoped to. */
export type PendingDeliveryScope = {
  sourceId?: string;
  routeId?: string;
  destinationId?: string;
};

/**
 * Counts queued deliveries before a configuration row is disabled.
 *
 * `operations.list` already filters by source, route, destination and state,
 * and its `total` counts every match rather than a page, so requesting a single
 * row keeps this advisory check cheap. The disable confirmations pair the count
 * with their behavior copy: a disabled source keeps delivering queued jobs,
 * while a disabled route or destination pauses them.
 */
export function pendingDeliveriesQueryOptions(scope: PendingDeliveryScope) {
  const normalized = {
    ...(scope.sourceId ? { sourceId: scope.sourceId } : {}),
    ...(scope.routeId ? { routeId: scope.routeId } : {}),
    ...(scope.destinationId ? { destinationId: scope.destinationId } : {}),
  };

  return orpc.operations.list.queryOptions({
    input: { limit: 1, deliveryState: "pending", ...normalized },
    queryKey: [...operationsQueryKeys.all, "pending-deliveries", normalized] as const,
    // The dialog opens on demand; a short cache avoids refetching when the
    // operator compares rows, while still reflecting recently delivered jobs.
    staleTime: 15_000,
  });
}

export function operationsQueryOptions(filters: OperationFilterData) {
  const normalizedFilters = normalizeOperationFilters(filters);

  return orpc.operations.list.queryOptions({
    input: {
      limit: 20,
      eventPage: normalizedFilters.eventPage ?? 1,
      ...normalizedFilters,
    },
    queryKey: operationsQueryKeys.list(normalizedFilters),
  });
}

/**
 * Recent events for pickers that need a real sample (for example the
 * destination preview). The operations list projection also returns a delivery
 * page, which the picker ignores; reusing the procedure keeps the read surface
 * small until a dedicated events-only list is worth adding.
 */
export function recentEventsQueryOptions(limit = 20) {
  return orpc.operations.list.queryOptions({
    input: { limit },
    queryKey: [...operationsQueryKeys.all, "recent-events", limit] as const,
    staleTime: 30_000,
  });
}

export function eventDetailQueryOptions(eventId: string) {
  return orpc.operations.getEventDetail.queryOptions({
    input: { id: eventId },
    queryKey: operationsQueryKeys.eventDetail(eventId),
  });
}

/**
 * Recurrence context for one event: earlier occurrences of the same
 * fingerprint and what changed since the latest one.
 *
 * Loaded only when its tab is opened, so the default detail view keeps its
 * current query count. Histories are append-only, but a new occurrence of the
 * same fingerprint changes this projection, hence the short stale time rather
 * than a permanent cache.
 */
export function eventFingerprintContextQueryOptions(eventId: string) {
  return orpc.operations.getEventFingerprintContext.queryOptions({
    input: { id: eventId },
    queryKey: operationsQueryKeys.eventFingerprintContext(eventId),
    staleTime: 30_000,
  });
}

export function eventReplayPreviewQueryOptions(eventId: string) {
  return orpc.operations.previewEventReplay.queryOptions({
    input: { eventId },
    queryKey: operationsQueryKeys.eventReplayPreview(eventId),
  });
}

export function routeReplayPreviewQueryOptions(routeId: string) {
  return orpc.operations.previewRouteReplay.queryOptions({
    input: {
      routeId,
      limit: 20,
    },
    queryKey: operationsQueryKeys.routeReplayPreview(routeId),
  });
}

export function deliveryDetailQueryOptions(deliveryId: string) {
  return orpc.operations.getDeliveryDetail.queryOptions({
    input: { id: deliveryId },
    queryKey: operationsQueryKeys.deliveryDetail(deliveryId),
  });
}

/**
 * Cross-page failure signal for the dashboard header.
 *
 * Reuses `operations.list` with a single-row page: its `total` counts every
 * failed delivery in the window, so the header needs no dedicated summary
 * endpoint. The indicator polls on a minute, hence the short stale time.
 */
export function failedDeliveriesQueryOptions() {
  return orpc.operations.list.queryOptions({
    input: { limit: 1, deliveryState: "failed", range: "24h" },
    queryKey: [...operationsQueryKeys.all, "failed-deliveries"] as const,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/**
 * What the worker would claim next, used by the paused banner.
 *
 * Callers enable it only while delivery is paused; a short stale time keeps a
 * remount from refetching while the banner itself refetches on a timer so the
 * count tracks events that arrive during the pause.
 */
export function deliveryBacklogQueryOptions() {
  return orpc.operations.getDeliveryBacklog.queryOptions({
    queryKey: operationsQueryKeys.deliveryBacklog(),
    staleTime: 15_000,
  });
}

function normalizeOperationFilters(filters: OperationFilterData): OperationFilterData {
  return {
    ...(filters.sourceId ? { sourceId: filters.sourceId } : {}),
    ...(filters.severity ? { severity: filters.severity } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.deliveryOutcome ? { deliveryOutcome: filters.deliveryOutcome } : {}),
    ...(filters.destinationId ? { destinationId: filters.destinationId } : {}),
    ...(filters.destinationKind ? { destinationKind: filters.destinationKind } : {}),
    ...(filters.routeId ? { routeId: filters.routeId } : {}),
    ...(filters.receipt ? { receipt: filters.receipt } : {}),
    ...(filters.deliveryState ? { deliveryState: filters.deliveryState } : {}),
    ...(filters.minAttempts && filters.minAttempts > 0 ? { minAttempts: filters.minAttempts } : {}),
    ...(filters.range ? { range: filters.range } : {}),
    // `created` is the server default; only a non-default basis needs to be
    // sent (and keyed), otherwise every default request differs from the rest.
    ...(filters.timeField ? { timeField: filters.timeField } : {}),
    // The anchor only applies to the window it was captured with, so it stays
    // out of the request (and the query key) when there is no window.
    ...(filters.range && filters.rangeAnchor ? { rangeAnchor: filters.rangeAnchor } : {}),
    ...(filters.q?.trim() ? { q: filters.q.trim() } : {}),
    ...(filters.eventPage && filters.eventPage > 1 ? { eventPage: filters.eventPage } : {}),
    ...(filters.deliveryPage && filters.deliveryPage > 1
      ? { deliveryPage: filters.deliveryPage }
      : {}),
  };
}
