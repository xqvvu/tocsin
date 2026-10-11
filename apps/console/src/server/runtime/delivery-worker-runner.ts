import { redactText } from "@tocsin/core";

import type {
  DeliveryWorkerRunOptions,
  DeliveryWorkerRunResult,
} from "#/server/deliveries/delivery-worker.service.types";

export interface DeliveryWorkerRunnerHealthSnapshot {
  state: "idle" | "running" | "failed";
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastError: string | null;
  lastRun: DeliveryWorkerRunResult | null;
}

export interface DeliveryWorkerTimer {
  unref?: () => void;
}

export type DeliveryWorkerSetInterval = (
  callback: () => void,
  intervalMs: number,
) => DeliveryWorkerTimer;

export type DeliveryWorkerClearInterval = (timer: DeliveryWorkerTimer) => void;

export interface RunnableDeliveryWorker {
  runOnce(options?: DeliveryWorkerRunOptions): Promise<DeliveryWorkerRunResult>;
}

export interface DeliveryWorkerRunnerOptions {
  worker: RunnableDeliveryWorker;
  intervalMs?: number;
  limit?: number;
  setIntervalFn?: DeliveryWorkerSetInterval;
  clearIntervalFn?: DeliveryWorkerClearInterval;
  onRunComplete?: (result: DeliveryWorkerRunResult) => void;
  onError?: (error: unknown) => void;
}

export interface DeliveryWorkerRunner {
  runNow(): Promise<DeliveryWorkerRunResult | null>;
  getHealth(): DeliveryWorkerRunnerHealthSnapshot;
  stop(): void;
}

export function createDeliveryWorkerRunner(
  options: DeliveryWorkerRunnerOptions,
): DeliveryWorkerRunner {
  const intervalMs = options.intervalMs ?? 5_000;
  const setIntervalFn =
    options.setIntervalFn ??
    ((callback, intervalMs) => setInterval(callback, intervalMs) as DeliveryWorkerTimer);
  const clearIntervalFn =
    options.clearIntervalFn ?? ((timer) => clearInterval(timer as ReturnType<typeof setInterval>));
  let running: Promise<DeliveryWorkerRunResult> | null = null;
  let health: DeliveryWorkerRunnerHealthSnapshot = {
    state: "idle",
    lastStartedAt: null,
    lastFinishedAt: null,
    lastError: null,
    lastRun: null,
  };

  async function runNow(): Promise<DeliveryWorkerRunResult | null> {
    if (running) {
      return null;
    }

    health = {
      ...health,
      state: "running",
      lastStartedAt: new Date().toISOString(),
      lastError: null,
    };
    running = options.worker.runOnce({
      limit: options.limit,
    });

    try {
      const result = await running;

      health = {
        state: "idle",
        lastStartedAt: result.startedAt,
        lastFinishedAt: result.finishedAt,
        lastError: null,
        lastRun: result,
      };
      options.onRunComplete?.(result);

      return result;
    } catch (error) {
      health = {
        ...health,
        state: "failed",
        lastFinishedAt: new Date().toISOString(),
        lastError: redactText(error instanceof Error ? error.message : String(error)),
      };
      options.onError?.(error);
      return null;
    } finally {
      running = null;
    }
  }

  const timer = setIntervalFn(() => {
    void runNow();
  }, intervalMs);

  timer.unref?.();

  return {
    runNow,
    getHealth() {
      return { ...health };
    },
    stop() {
      clearIntervalFn(timer);
    },
  };
}
