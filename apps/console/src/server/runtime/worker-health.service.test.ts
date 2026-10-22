import { describe, expect, it } from "vite-plus/test";

import type { DeliveryWorkerHealthSnapshot } from "#/server/deliveries/delivery-worker.service.types";
import { WorkerHealthService } from "#/server/runtime/worker-health.service";

const IDLE: DeliveryWorkerHealthSnapshot = {
  state: "idle",
  lastStartedAt: null,
  lastFinishedAt: null,
  lastError: null,
  lastRun: null,
};

describe("worker health service", () => {
  it("reports both queues as not started without inventing a snapshot", () => {
    const service = new WorkerHealthService({
      readDeliveryWorker: () => null,
      readOncallWorker: () => null,
    });

    expect(service.getWorkerHealth()).toEqual({
      delivery: {
        started: false,
        state: "idle",
        lastStartedAt: null,
        lastFinishedAt: null,
        lastError: null,
        lastRun: null,
      },
      oncall: {
        started: false,
        state: "idle",
        lastStartedAt: null,
        lastFinishedAt: null,
        lastError: null,
        lastRun: null,
      },
    });
  });

  it("projects each queue independently", () => {
    const service = new WorkerHealthService({
      readDeliveryWorker: () => ({
        state: "failed",
        lastStartedAt: "2026-10-22T01:00:00.000Z",
        lastFinishedAt: "2026-10-22T01:00:02.000Z",
        lastError: "target timed out",
        lastRun: {
          claimed: 4,
          reclaimed: 1,
          succeeded: 2,
          failed: 1,
          retrying: 1,
          startedAt: "2026-10-22T01:00:00.000Z",
          finishedAt: "2026-10-22T01:00:02.000Z",
          paused: false,
        },
      }),
      readOncallWorker: () => IDLE,
    });

    expect(service.getWorkerHealth()).toEqual({
      delivery: {
        started: true,
        state: "failed",
        lastStartedAt: "2026-10-22T01:00:00.000Z",
        lastFinishedAt: "2026-10-22T01:00:02.000Z",
        lastError: "target timed out",
        lastRun: {
          claimed: 4,
          reclaimed: 1,
          succeeded: 2,
          failed: 1,
          retrying: 1,
          startedAt: "2026-10-22T01:00:00.000Z",
          finishedAt: "2026-10-22T01:00:02.000Z",
          paused: false,
        },
      },
      oncall: {
        started: true,
        state: "idle",
        lastStartedAt: null,
        lastFinishedAt: null,
        lastError: null,
        lastRun: null,
      },
    });
  });

  it("redacts credential shapes that survived upstream", () => {
    const service = new WorkerHealthService({
      readDeliveryWorker: () => ({
        ...IDLE,
        state: "failed",
        lastError: "send failed: Authorization: Bearer worker-secret; token=abc123",
      }),
      readOncallWorker: () => null,
    });

    expect(service.getWorkerHealth().delivery.lastError).toBe(
      "send failed: Authorization: [REDACTED]; token=[REDACTED]",
    );
  });

  it("keeps the paused flag only when the worker reported it", () => {
    const service = new WorkerHealthService({
      readDeliveryWorker: () => ({
        ...IDLE,
        lastRun: {
          claimed: 0,
          reclaimed: 0,
          succeeded: 0,
          failed: 0,
          retrying: 0,
          startedAt: "2026-10-22T01:00:00.000Z",
          finishedAt: "2026-10-22T01:00:00.000Z",
        },
      }),
      readOncallWorker: () => null,
    });

    const lastRun = service.getWorkerHealth().delivery.lastRun;

    expect(lastRun).not.toBeNull();
    expect(Object.hasOwn(lastRun ?? {}, "paused")).toBe(false);
  });

  it("reads the live runners on every call", () => {
    let deliveryCalls = 0;
    const service = new WorkerHealthService({
      readDeliveryWorker: () => {
        deliveryCalls += 1;
        return { ...IDLE, lastStartedAt: `2026-10-22T0${deliveryCalls}:00:00.000Z` };
      },
      readOncallWorker: () => null,
    });

    expect(service.getWorkerHealth().delivery.lastStartedAt).toBe("2026-10-22T01:00:00.000Z");
    expect(service.getWorkerHealth().delivery.lastStartedAt).toBe("2026-10-22T02:00:00.000Z");
  });
});
