import type {
  DeliveryListItem,
  DeliveryReceiptFilter,
  DeliveryState,
  DeliveryTimeField,
  DestinationKind,
  EventDeliveryOutcome,
  EventDetail,
  EventFingerprintContext,
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
  /**
   * Earlier occurrences of one event's fingerprint on the same source, with
   * the change set against the most recent one. `null` when the event itself
   * no longer exists.
   */
  getEventFingerprintContext(eventId: string): Promise<EventFingerprintContext | null>;
  listDeliveries(query?: DeliveryListQuery): Promise<NumberedPage<DeliveryListItem>>;
}

export interface EventListQuery {
  sourceId?: string;
  severity?: NormalizedEvent["severity"];
  status?: NormalizedEvent["status"];
  /**
   * Only the events whose fan-out produced no delivery (`none`) or at least
   * one delivery in that state. The deliveries themselves still define the
   * per-state counts the list shows.
   */
  deliveryOutcome?: EventDeliveryOutcome;
  /** Inclusive lower bound on `events.received_at`, as an ISO timestamp. */
  since?: string;
  /**
   * Literal substring over title, message, fingerprint, and event/delivery ids.
   * Whitespace-separated terms are ANDed (at most 8): each must match
   * somewhere in the row.
   */
  q?: string;
  page?: number;
  limit?: number;
}

export interface DeliveryListQuery {
  sourceId?: string;
  severity?: NormalizedEvent["severity"];
  status?: NormalizedEvent["status"];
  destinationId?: string;
  /** Only deliveries routed to destinations of one adapter kind. */
  destinationKind?: DestinationKind;
  /** Only the deliveries created by one route; manual deliveries have none. */
  routeId?: string;
  /** Only the deliveries silenced by one rule ("what did this rule hit?"). */
  suppressionId?: string;
  /**
   * Only deliveries whose target returned a message reference (`present`), or
   * every delivery without a complete reference (`missing`).
   */
  receipt?: DeliveryReceiptFilter;
  state?: DeliveryState;
  /** Inclusive lower bound on `deliveries.attempt_count`; 0 is "any". */
  minAttempts?: number;
  /**
   * Which timestamp `since` compares against and which one orders the list.
   * Defaults to `created`; `updated` keeps retried jobs inside the window their
   * visible 更新时间 belongs to.
   */
  timeField?: DeliveryTimeField;
  /** Inclusive lower bound on the selected `timeField` column, as an ISO timestamp. */
  since?: string;
  /**
   * Literal substring over the event fields, event/delivery ids, the latest
   * delivery error, and the destination or route name. Whitespace-separated
   * terms are ANDed (at most 8): each must match somewhere in the row.
   */
  q?: string;
  page?: number;
  limit?: number;
}
