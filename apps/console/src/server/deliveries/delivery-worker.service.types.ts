import type { DestinationRegistry, DestinationSendContext } from "@tocsin/destinations";

import type { SqliteStore } from "#/infra/sqlite/store";
import type { DeliveryBackoffOptions } from "#/server/deliveries/delivery-execution";
import type { DestinationConfigResolver } from "#/server/integrations/destination-config-resolver";
import type { OncallPingTrigger } from "#/server/oncall/oncall.service.types";

export interface DeliveryWorkerOptions {
  store: SqliteStore;
  destinations: DestinationRegistry;
  sendContext?: DestinationSendContext;
  now?: () => string;
  batchSize?: number;
  staleRunningTimeoutMs?: number;
  backoff?: DeliveryBackoffOptions;
  /** Resolves server-side references (for example a Feishu app credential) before each send. */
  resolveDestinationConfig?: DestinationConfigResolver;
  /** Deployment address used to build `tocsin.eventUrl` in outbound messages. */
  publicBaseUrl?: string;
  /** Auto-paging hook invoked after a successful send that carries a provider reference. */
  triggerPings?: OncallPingTrigger;
}

export interface DeliveryWorkerRunOptions {
  now?: string;
  limit?: number;
}

export interface DeliveryWorkerRunResult {
  claimed: number;
  reclaimed: number;
  succeeded: number;
  failed: number;
  retrying: number;
  startedAt: string;
  finishedAt: string;
  /** True when outbound delivery is paused and this run touched nothing. */
  paused?: boolean;
}

export interface DeliveryWorkerHealthSnapshot {
  state: "idle" | "running" | "failed";
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastError: string | null;
  lastRun: DeliveryWorkerRunResult | null;
}
