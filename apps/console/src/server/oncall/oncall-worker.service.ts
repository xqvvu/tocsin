import { redactText } from "@tocsin/core";

import type { DeliveryWorkerRunResult } from "#/server/deliveries/delivery-worker.service.types";
import { OncallExecution, type OncallExecutionOutcome } from "#/server/oncall/oncall-execution";
import type {
  OncallWorkerHealthSnapshot,
  OncallWorkerOptions,
  OncallWorkerRunOptions,
  OncallWorkerRunResult,
} from "#/server/oncall/oncall-worker.service.types";

/**
 * Drains the paging queue.
 *
 * Mirrors the delivery worker's reclaim → claim → execute shape so both queues
 * share the same runner and backoff semantics; a ping's failure only ever
 * touches the ping.
 */
export class OncallWorker {
  private readonly store: OncallWorkerOptions["store"];
  private readonly execution: OncallExecution;
  private readonly now: () => string;
  private readonly batchSize: number;
  private readonly staleRunningTimeoutMs: number;
  private readonly health: OncallWorkerHealthSnapshot = {
    state: "idle",
    lastStartedAt: null,
    lastFinishedAt: null,
    lastError: null,
    lastRun: null,
  };

  constructor(options: OncallWorkerOptions) {
    this.store = options.store;
    this.now = options.now ?? (() => new Date().toISOString());
    this.execution = new OncallExecution({
      store: options.store,
      urgency: options.urgency,
      resolveDestinationConfig: options.resolveDestinationConfig,
      sendContext: options.sendContext,
      backoff: options.backoff,
      now: this.now,
    });
    this.batchSize = options.batchSize ?? 10;
    this.staleRunningTimeoutMs = options.staleRunningTimeoutMs ?? 5 * 60_000;
  }

  getHealth(): OncallWorkerHealthSnapshot {
    return { ...this.health };
  }

  async runOnce(options: OncallWorkerRunOptions = {}): Promise<OncallWorkerRunResult> {
    const now = options.now ?? this.now();

    this.health.state = "running";
    this.health.lastStartedAt = now;
    this.health.lastError = null;

    try {
      const reclaimed = await this.store.oncall.reclaimStaleRunning({
        staleBefore: staleRunningCutoff(now, this.staleRunningTimeoutMs),
        now,
      });
      const claimed = await this.store.oncall.claimNext({
        now,
        limit: options.limit ?? this.batchSize,
      });
      const result: OncallWorkerRunResult = {
        claimed: claimed.length,
        reclaimed: reclaimed.reclaimed,
        succeeded: 0,
        failed: 0,
        retrying: 0,
        startedAt: now,
        finishedAt: now,
      };

      for (const ping of claimed) {
        addOutcome(result, await this.execution.execute(ping, now));
      }

      result.finishedAt = options.now ?? this.now();
      this.health.state = "idle";
      this.health.lastFinishedAt = result.finishedAt;
      this.health.lastRun = result;

      return result;
    } catch (error) {
      const finishedAt = options.now ?? this.now();

      this.health.state = "failed";
      this.health.lastFinishedAt = finishedAt;
      this.health.lastError = redactWorkerError(error);

      throw error;
    }
  }
}

function staleRunningCutoff(now: string, timeoutMs: number): string {
  return new Date(new Date(now).valueOf() - timeoutMs).toISOString();
}

function redactWorkerError(error: unknown): string {
  return redactText(error instanceof Error ? error.message : String(error));
}

function addOutcome(result: DeliveryWorkerRunResult, outcome: OncallExecutionOutcome): void {
  if (outcome === "fired") {
    result.succeeded += 1;
  } else if (outcome === "retrying") {
    result.retrying += 1;
  } else if (outcome === "failed") {
    result.failed += 1;
  }
  // "superseded" belongs to the worker that reclaimed the ping, so it counts
  // neither as a success nor as a failure of this batch.
}
