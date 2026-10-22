import type { WorkerHealthEntry, WorkerHealthOutput } from "@tocsin/api";
import { redactText } from "@tocsin/core";

import type {
  DeliveryWorkerHealthSnapshot,
  DeliveryWorkerRunResult,
} from "#/server/deliveries/delivery-worker.service.types";
import type {
  WorkerHealthReader,
  WorkerHealthServiceOptions,
} from "#/server/runtime/worker-health.service.types";

const NOT_STARTED: WorkerHealthEntry = {
  started: false,
  state: "idle",
  lastStartedAt: null,
  lastFinishedAt: null,
  lastError: null,
  lastRun: null,
};

/**
 * Read-only projection of the in-process background workers.
 *
 * The service observes runners the container already assembled: both readers
 * return `null` when a runner does not exist yet, and the projection must stay
 * side-effect free. Every field is mapped explicitly so a future worker field
 * cannot reach the browser without a deliberate DTO change, and `lastError` is
 * redacted again here rather than trusted from upstream.
 */
export class WorkerHealthService {
  private readonly readDeliveryWorker: WorkerHealthReader;
  private readonly readOncallWorker: WorkerHealthReader;

  constructor(options: WorkerHealthServiceOptions) {
    this.readDeliveryWorker = options.readDeliveryWorker;
    this.readOncallWorker = options.readOncallWorker;
  }

  getWorkerHealth(): WorkerHealthOutput {
    return {
      delivery: projectEntry(this.readDeliveryWorker()),
      oncall: projectEntry(this.readOncallWorker()),
    };
  }
}

function projectEntry(snapshot: DeliveryWorkerHealthSnapshot | null): WorkerHealthEntry {
  if (snapshot === null) {
    // Copy so a caller mutating the DTO cannot poison later projections.
    return { ...NOT_STARTED };
  }

  return {
    started: true,
    state: snapshot.state,
    lastStartedAt: snapshot.lastStartedAt,
    lastFinishedAt: snapshot.lastFinishedAt,
    lastError: snapshot.lastError === null ? null : redactText(snapshot.lastError),
    lastRun: snapshot.lastRun === null ? null : projectRun(snapshot.lastRun),
  };
}

function projectRun(run: DeliveryWorkerRunResult): DeliveryWorkerRunResult {
  return {
    claimed: run.claimed,
    reclaimed: run.reclaimed,
    succeeded: run.succeeded,
    failed: run.failed,
    retrying: run.retrying,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    ...(run.paused === undefined ? {} : { paused: run.paused }),
  };
}
