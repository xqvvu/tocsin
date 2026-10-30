import type {
  DeliveryAttemptStatusClass,
  DeliveryListItem,
  DeliveryReceiptFilter,
  DeliveryState,
  DeliveryTimeField,
  DestinationKind,
  EventDeliveryOutcome,
  EventDestinationMatch,
  EventDestinationOutcome,
  EventListItem,
  NormalizedEvent,
  NumberedPage,
  OncallPing,
  OperationTimeRange,
} from "@tocsin/core";

import type { SqliteStore } from "#/infra/sqlite/store";

/** The narrow paging surface the operations capability delegates to. */
export interface OperationsPager {
  buzzDelivery(input: { deliveryId: string; initiatedBy?: string | null }): Promise<OncallPing[]>;
}

export interface OperationsServiceOptions {
  store: SqliteStore;
  oncall: OperationsPager;
  /**
   * Clock used to resolve relative time windows. Injectable so tests can pin
   * the boundary instead of racing the wall clock.
   */
  now?: () => Date;
}

export interface ListOperationsInput {
  limit?: number;
  sourceId?: string;
  /** One severity or several, as the console's multi-select writes them. */
  severity?: NormalizedEvent["severity"] | NormalizedEvent["severity"][];
  status?: NormalizedEvent["status"] | NormalizedEvent["status"][];
  /** Events-only: no delivery, or at least one delivery in that state. */
  deliveryOutcome?: EventDeliveryOutcome;
  /** Events-only: whether a provider parser rejected the webhook payload. */
  parseFailed?: boolean;
  destinationId?: string;
  /** Events-only: did the alert reach that destination, or never get there. */
  destinationMatch?: EventDestinationMatch;
  /**
   * Events-only: the state of the delivery to `destinationId`. Requires the
   * destination; `missing` coverage stays with `destinationMatch`.
   */
  destinationOutcome?: EventDestinationOutcome;
  /** Delivery-only: one destination adapter kind. */
  destinationKind?: DestinationKind;
  routeId?: string;
  /** Delivery-only: the exact event a count badge was clicked from. */
  eventId?: string;
  /** Delivery-only: target message reference present or missing. */
  receipt?: DeliveryReceiptFilter;
  /** One delivery state or several, matching the multi-select. */
  deliveryState?: DeliveryState | DeliveryState[];
  /** Delivery-only: keep jobs attempted at least this many times. */
  minAttempts?: number;
  /**
   * Delivery-only: the HTTP status class of the latest completed attempt.
   * Separates a misconfigured target (4xx) from an unhealthy one (5xx).
   */
  lastAttemptStatusClass?: DeliveryAttemptStatusClass;
  range?: OperationTimeRange;
  /** Instant the window was opened; without it the window follows the clock. */
  rangeAnchor?: string;
  /**
   * Exclusive upper bound on the list's time column, captured on the first
   * page turn so rows arriving mid-walk cannot shift the offsets.
   */
  rangeUntil?: string;
  /** Delivery-only: compare the window against enqueue or last-activity time. */
  timeField?: DeliveryTimeField;
  q?: string;
  /**
   * One exact fingerprint on both lists: every occurrence on the events list,
   * every notification one alert sent on the delivery list.
   */
  fingerprint?: string;
  eventPage?: number;
  deliveryPage?: number;
}

export interface OperationsList {
  events: NumberedPage<EventListItem>;
  deliveries: NumberedPage<DeliveryListItem>;
}
