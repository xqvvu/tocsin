import type { DeliveryListItem, NumberedPage } from "@tocsin/core";

import type { SqliteStore } from "#/infra/sqlite/store";

export interface SuppressionServiceOptions {
  store: SqliteStore;
  /** Injectable clock so tests can pin `startsAt` and window validation. */
  now?: () => string;
}

export interface ListSuppressionHitsInput {
  id: string;
  page?: number;
  limit?: number;
}

export type SuppressionHits = NumberedPage<DeliveryListItem>;
