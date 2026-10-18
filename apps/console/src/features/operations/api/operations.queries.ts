import type { OperationFilterData } from "#/features/operations/model/operation-search";
import { orpc } from "#/lib/orpc";

export const operationsQueryKeys = {
  all: ["operations"] as const,
  list: (filters: OperationFilterData) =>
    [...operationsQueryKeys.all, "list", normalizeOperationFilters(filters)] as const,
  eventDetail: (eventId: string) => [...operationsQueryKeys.all, "events", "detail", eventId],
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
};

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

export function eventDetailQueryOptions(eventId: string) {
  return orpc.operations.getEventDetail.queryOptions({
    input: { id: eventId },
    queryKey: operationsQueryKeys.eventDetail(eventId),
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

function normalizeOperationFilters(filters: OperationFilterData): OperationFilterData {
  return {
    ...(filters.sourceId ? { sourceId: filters.sourceId } : {}),
    ...(filters.severity ? { severity: filters.severity } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.destinationId ? { destinationId: filters.destinationId } : {}),
    ...(filters.deliveryState ? { deliveryState: filters.deliveryState } : {}),
    ...(filters.range ? { range: filters.range } : {}),
    ...(filters.q?.trim() ? { q: filters.q.trim() } : {}),
    ...(filters.eventPage && filters.eventPage > 1 ? { eventPage: filters.eventPage } : {}),
    ...(filters.deliveryPage && filters.deliveryPage > 1
      ? { deliveryPage: filters.deliveryPage }
      : {}),
  };
}
