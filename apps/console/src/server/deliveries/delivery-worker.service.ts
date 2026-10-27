import { getLogger } from "@logtape/logtape";

import { redactText } from "@tocsin/core";

import {
  DeliveryExecution,
  type DeliveryExecutionOutcome,
} from "#/server/deliveries/delivery-execution";
import type {
  DeliveryWorkerHealthSnapshot,
  DeliveryWorkerOptions,
  DeliveryWorkerRunOptions,
  DeliveryWorkerRunResult,
} from "#/server/deliveries/delivery-worker.service.types";
import { safeErrorProperties } from "#/server/runtime/log-safety";

const deliveryLogger = getLogger(["tocsin", "delivery"]);

export class DeliveryWorker {
  private readonly store: DeliveryWorkerOptions["store"];
  private readonly execution: DeliveryExecution;
  private readonly now: () => string;
  private readonly batchSize: number;
  private readonly staleRunningTimeoutMs: number;
  private readonly health: DeliveryWorkerHealthSnapshot = {
    state: "idle",
    lastStartedAt: null,
    lastFinishedAt: null,
    lastError: null,
    lastRun: null,
  };

  constructor(options: DeliveryWorkerOptions) {
    this.store = options.store;
    this.execution = new DeliveryExecution({
      store: options.store,
      destinations: options.destinations,
      sendContext: options.sendContext,
      backoff: options.backoff,
      resolveDestinationConfig: options.resolveDestinationConfig,
      publicBaseUrl: options.publicBaseUrl,
      triggerPings: options.triggerPings,
    });
    this.now = options.now ?? (() => new Date().toISOString());
    this.batchSize = options.batchSize ?? 10;
    this.staleRunningTimeoutMs = options.staleRunningTimeoutMs ?? 5 * 60_000;
  }

  getHealth(): DeliveryWorkerHealthSnapshot {
    return { ...this.health };
  }

  async runOnce(options: DeliveryWorkerRunOptions = {}): Promise<DeliveryWorkerRunResult> {
    const now = options.now ?? this.now();

    this.health.state = "running";
    this.health.lastStartedAt = now;
    this.health.lastError = null;

    try {
      // Read settings before touching the queue: an operator pause must leave
      // every queued job exactly as it was, and a settings read failure must
      // not strand freshly claimed deliveries in `running`.
      const settings = await this.store.settings.get();

      if (settings.deliveryPaused) {
        const pausedResult: DeliveryWorkerRunResult = {
          claimed: 0,
          reclaimed: 0,
          succeeded: 0,
          failed: 0,
          retrying: 0,
          startedAt: now,
          finishedAt: now,
          paused: true,
        };

        this.health.state = "idle";
        this.health.lastFinishedAt = pausedResult.finishedAt;
        this.health.lastRun = pausedResult;

        return pausedResult;
      }

      const reclaimed = await this.store.deliveries.reclaimStaleRunning({
        staleBefore: staleRunningCutoff(now, this.staleRunningTimeoutMs),
        now,
      });
      const claimed = await this.store.deliveries.claimNext({
        now,
        limit: options.limit ?? this.batchSize,
      });
      const presentation = { locale: settings.locale, timeZone: settings.timeZone };
      const result: DeliveryWorkerRunResult = {
        claimed: claimed.length,
        reclaimed: reclaimed.reclaimed,
        succeeded: 0,
        failed: 0,
        retrying: 0,
        startedAt: now,
        finishedAt: now,
        paused: false,
      };

      for (const delivery of claimed) {
        // One claimed row must never strand the rest of the batch in `running`
        // until the stale attempt reclaim runs again. Bookkeeping failures are
        // already absorbed inside the execution; this guard covers anything
        // else that escapes a single delivery.
        try {
          addOutcome(
            result,
            await this.execution.execute(
              delivery,
              now,
              presentation,
              () => options.now ?? this.now(),
            ),
          );
        } catch (error) {
          result.failed += 1;
          deliveryLogger.error("Delivery {deliveryId} failed outside its recorded outcome", {
            deliveryId: delivery.job.id,
            eventId: delivery.event.id,
            destinationId: delivery.destination.id,
            destinationKind: delivery.destination.kind,
            ...safeErrorProperties(error),
          });
        }
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

function addOutcome(result: DeliveryWorkerRunResult, outcome: DeliveryExecutionOutcome): void {
  if (outcome === "succeeded") {
    result.succeeded += 1;
  } else if (outcome === "retrying") {
    result.retrying += 1;
  } else {
    result.failed += 1;
  }
}
