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
  q?: string;
  page?: number;
  limit?: number;
}

export interface DeliveryListQuery {
  sourceId?: string;
  severity?: NormalizedEvent["severity"];
  status?: NormalizedEvent["status"];
  destinationId?: string;
  /** Only the deliveries silenced by one rule ("what did this rule hit?"). */
  suppressionId?: string;
  state?: DeliveryState;
  q?: string;
  page?: number;
  limit?: number;
}
