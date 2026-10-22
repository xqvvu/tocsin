import type { DeliveryWorkerHealthSnapshot } from "#/server/deliveries/delivery-worker.service.types";

/**
 * Reads one runner's current health.
 *
 * Returns `null` when the runner was never assembled in this process. The
 * projection reports that as `started: false` instead of pretending an idle
 * worker exists, and the reader must never create a runner as a side effect.
 */
export type WorkerHealthReader = () => DeliveryWorkerHealthSnapshot | null;

export interface WorkerHealthServiceOptions {
  readDeliveryWorker: WorkerHealthReader;
  readOncallWorker: WorkerHealthReader;
}
