import type {
  DeliveryListItem,
  DeliveryReceiptFilter,
  DeliveryState,
  DeliveryTimeField,
  DestinationKind,
  EventDeliveryOutcome,
  EventDestinationMatch,
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
  severity?: NormalizedEvent["severity"];
  status?: NormalizedEvent["status"];
  /** Events-only: no delivery, or at least one delivery in that state. */
  deliveryOutcome?: EventDeliveryOutcome;
  destinationId?: string;
  /** Events-only: did the alert reach that destination, or never get there. */
  destinationMatch?: EventDestinationMatch;
  /** Delivery-only: one destination adapter kind. */
  destinationKind?: DestinationKind;
  routeId?: string;
  /** Delivery-only: the exact event a count badge was clicked from. */
  eventId?: string;
  /** Delivery-only: target message reference present or missing. */
  receipt?: DeliveryReceiptFilter;
  deliveryState?: DeliveryState;
  /** Delivery-only: keep jobs attempted at least this many times. */
  minAttempts?: number;
  range?: OperationTimeRange;
  /** Instant the window was opened; without it the window follows the clock. */
  rangeAnchor?: string;
  /** Delivery-only: compare the window against enqueue or last-activity time. */
  timeField?: DeliveryTimeField;
  q?: string;
  /** Events-only: one exact fingerprint, so "every occurrence" stays exact. */
  fingerprint?: string;
  eventPage?: number;
  deliveryPage?: number;
}

export interface OperationsList {
  events: NumberedPage<EventListItem>;
  deliveries: NumberedPage<DeliveryListItem>;
}
