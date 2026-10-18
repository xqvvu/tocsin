import type {
  DeliveryListItem,
  DeliveryState,
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
  destinationId?: string;
  routeId?: string;
  deliveryState?: DeliveryState;
  range?: OperationTimeRange;
  q?: string;
  eventPage?: number;
  deliveryPage?: number;
}

export interface OperationsList {
  events: NumberedPage<EventListItem>;
  deliveries: NumberedPage<DeliveryListItem>;
}
