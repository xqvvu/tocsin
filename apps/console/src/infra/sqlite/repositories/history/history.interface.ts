import type {
  DeliveryListItem,
  DeliveryState,
  EventDetail,
  EventListItem,
  NumberedPage,
  NormalizedEvent,
} from "@tocsin/core";

export type {
  DeliveryListItem,
  EventDetail,
  EventDetailDelivery,
  EventListItem,
} from "@tocsin/core";

export interface HistoryRepository {
  listEvents(query?: EventListQuery): Promise<NumberedPage<EventListItem>>;
  getEventDetail(eventId: string): Promise<EventDetail | null>;
  listDeliveries(query?: DeliveryListQuery): Promise<NumberedPage<DeliveryListItem>>;
}

export interface EventListQuery {
  sourceId?: string;
  severity?: NormalizedEvent["severity"];
  status?: NormalizedEvent["status"];
  /** Inclusive lower bound on `events.received_at`, as an ISO timestamp. */
  since?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface DeliveryListQuery {
  sourceId?: string;
  severity?: NormalizedEvent["severity"];
  status?: NormalizedEvent["status"];
  destinationId?: string;
  /** Only the deliveries created by one route; manual deliveries have none. */
  routeId?: string;
  /** Only the deliveries silenced by one rule ("what did this rule hit?"). */
  suppressionId?: string;
  state?: DeliveryState;
  /** Inclusive lower bound on `deliveries.created_at`, as an ISO timestamp. */
  since?: string;
  q?: string;
  page?: number;
  limit?: number;
}
