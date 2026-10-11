import type { DestinationSendContext, UrgencyRegistry } from "@tocsin/destinations";

import type { SqliteStore } from "#/infra/sqlite/store";
import type { DeliveryBackoffOptions } from "#/server/deliveries/delivery-execution";
import type {
  DeliveryWorkerRunOptions,
  DeliveryWorkerRunResult,
} from "#/server/deliveries/delivery-worker.service.types";
import type { DestinationConfigResolver } from "#/server/integrations/destination-config-resolver";

export interface OncallWorkerOptions {
  store: SqliteStore;
  /** Paging only ever places calls; the worker depends on the registry's ping method alone. */
  urgency: Pick<UrgencyRegistry, "ping">;
  /** Resolves server-side references (the Feishu app credential) before each call. */
  resolveDestinationConfig?: DestinationConfigResolver;
  sendContext?: DestinationSendContext;
  now?: () => string;
  batchSize?: number;
  staleRunningTimeoutMs?: number;
  backoff?: DeliveryBackoffOptions;
}

/**
 * Same shape as the delivery run result so the shared worker runner can drive
 * this worker; `succeeded` counts fired calls.
 */
export type OncallWorkerRunResult = DeliveryWorkerRunResult;

export type OncallWorkerRunOptions = DeliveryWorkerRunOptions;

export interface OncallWorkerHealthSnapshot {
  state: "idle" | "running" | "failed";
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastError: string | null;
  lastRun: OncallWorkerRunResult | null;
}
