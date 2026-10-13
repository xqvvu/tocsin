import type {
  DeliveryListItem,
  DeliveryState,
  EventListItem,
  NormalizedEvent,
  NumberedPage,
  OncallPing,
} from "@tocsin/core";

import type { SqliteStore } from "#/infra/sqlite/store";

/** The narrow paging surface the operations capability delegates to. */
export interface OperationsPager {
  buzzDelivery(input: { deliveryId: string; initiatedBy?: string | null }): Promise<OncallPing[]>;
}

export interface OperationsServiceOptions {
  store: SqliteStore;
  oncall: OperationsPager;
}

export interface ListOperationsInput {
  limit?: number;
  sourceId?: string;
  severity?: NormalizedEvent["severity"];
  status?: NormalizedEvent["status"];
  destinationId?: string;
  deliveryState?: DeliveryState;
  q?: string;
  eventPage?: number;
  deliveryPage?: number;
}

export interface OperationsList {
  events: NumberedPage<EventListItem>;
  deliveries: NumberedPage<DeliveryListItem>;
}
