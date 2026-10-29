import type {
  DeliveryListItem,
  DeliveryReceiptFilter,
  DeliveryState,
  DeliveryTimeField,
  DeletionImpact,
  DestinationKind,
  EventDeliveryOutcome,
  EventDestinationMatch,
  EventDestinationOutcome,
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
  /**
   * Delivery outcomes grouped by destination for the destinations list: one
   * aggregate pass instead of a query per row. Destinations with no deliveries
   * are absent, so the caller keeps its own "no history" fallback.
   */
  destinationDeliveryHealth(
    query: DestinationDeliveryHealthQuery,
  ): Promise<DestinationDeliveryHealthRow[]>;
  /**
   * History rows one source, route, or destination delete would remove through
   * the database's cascade. Counts the foreign keys SQLite acts on, so the
   * preview cannot drift from what the delete actually destroys.
   */
  countDeletionImpact(target: DeletionImpactTarget): Promise<DeletionImpact>;
}

/** Exactly one entity per preview, mirroring the single-row delete commands. */
export type DeletionImpactTarget =
  | { sourceId: string }
  | { routeId: string }
  | { destinationId: string };

export interface DestinationDeliveryHealthQuery {
  /** Inclusive lower bound on `deliveries.created_at` for the failure count. */
  since: string;
}

export interface DestinationDeliveryHealthRow {
  destinationId: string;
  lastSucceededAt: string | null;
  lastFailedAt: string | null;
  /** Queued or in-flight deliveries right now. */
  queuedCount: number;
  /** Failed deliveries created at or after `since`. */
  recentFailureCount: number;
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
  /**
   * Only events whose provider parser rejected the payload (`true`), or with
   * `false` every event the projection would not flag — including rows whose
   * provider metadata cannot be parsed, which stay readable but unfilterable.
   */
  parseFailed?: boolean;
  /**
   * Only events that did (`delivered`, the default) or did not (`missing`)
   * produce a delivery to this destination. `missing` also covers alerts that
   * reached nobody at all, which no delivery-level filter can find.
   */
  destinationId?: string;
  destinationMatch?: EventDestinationMatch;
  /**
   * Only events whose delivery to `destinationId` is in this state. Requires
   * `destinationId`, and describes the same delivery row as `destinationMatch`
   * so "the pager send failed" cannot be satisfied by another target's
   * successful send. `missing` coverage stays with `destinationMatch`.
   */
  destinationOutcome?: EventDestinationOutcome;
  /** Inclusive lower bound on `events.received_at`, as an ISO timestamp. */
  since?: string;
  /**
   * Exclusive upper bound on `events.received_at`. Freezing it while paging
   * keeps newly received alerts from shifting the offset-paginated rows.
   */
  until?: string;
  /**
   * Literal substring over title, message, fingerprint, and event/delivery ids.
   * Whitespace-separated terms are ANDed (at most 8): each must match
   * somewhere in the row.
   */
  q?: string;
  /**
   * One exact `events.fingerprint`. Unlike `q`, no other field is considered,
   * so "every occurrence of this alert" cannot pick up rows whose text merely
   * contains the same characters.
   */
  fingerprint?: string;
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
  /**
   * Only the deliveries fanned out from one event. The events table links a
   * delivery-count badge here, so "what did this alert send" is exact instead
   * of a fuzzy id search.
   */
  eventId?: string;
  /**
   * Only deliveries whose event carries exactly this fingerprint, across every
   * occurrence of the alert. Unlike `q`, no other field is considered, so
   * "every notification this alert ever sent" cannot pick up rows whose text
   * merely contains the same characters. The recurrence view links here.
   */
  fingerprint?: string;
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
   * Exclusive upper bound on the same `timeField` column. Freezing it while
   * paging keeps jobs enqueued mid-walk from shifting the offsets.
   */
  until?: string;
  /**
   * Literal substring over the event fields, event/delivery ids, the latest
   * delivery error, and the destination or route name. Whitespace-separated
   * terms are ANDed (at most 8): each must match somewhere in the row.
   */
  q?: string;
  page?: number;
  limit?: number;
}
