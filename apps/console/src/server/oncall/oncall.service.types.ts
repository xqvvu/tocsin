import type { ProviderReference } from "@tocsin/core";

import type { ClaimedDelivery } from "#/infra/sqlite/repositories/delivery/delivery.interface";
import type { SqliteStore } from "#/infra/sqlite/store";

export interface OncallServiceOptions {
  store: SqliteStore;
  /** Repeat pages for the same fingerprint are suppressed inside this window. */
  dedupeWindowMs?: number;
  now?: () => string;
  /**
   * Best-effort immediate dispatch after a manual page is queued. A failure is
   * logged and leaves the records to the worker's retry schedule.
   */
  dispatchNow?: (now: string) => Promise<unknown>;
}

export interface OncallPingTriggerInput {
  delivery: ClaimedDelivery;
  /** The message handle captured from the delivery's app send. */
  providerReference: ProviderReference;
  /** Defaults to the service clock. */
  now?: string;
}

export type OncallPingTrigger = (input: OncallPingTriggerInput) => Promise<void>;

export interface BuzzDeliveryInput {
  deliveryId: string;
  /** Dashboard user who triggered the page; recorded for audit. */
  initiatedBy?: string | null;
}
