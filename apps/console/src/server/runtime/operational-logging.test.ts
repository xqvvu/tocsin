import { AsyncLocalStorage } from "node:async_hooks";

import { configure, reset, type LogRecord } from "@logtape/logtape";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { createDefaultDestinationRegistry } from "@tocsin/destinations";
import { createDefaultProviderRegistry } from "@tocsin/providers";

import { openSqliteStore, type SqliteStore } from "#/infra/sqlite/store";
import { DeliveryWorker } from "#/server/deliveries/delivery-worker.service";
import { WebhookIntakeService, hashSourceToken } from "#/server/intake/intake.service";
import { createApplicationContainer } from "#/server/runtime/container";
import type { DeliveryWorkerRunnerOptions } from "#/server/runtime/delivery-worker-runner";
import { withLogRedaction } from "#/server/runtime/log-safety";

const now = "2026-07-10T08:00:00.000Z";
const records: LogRecord[] = [];

describe("operational logging", () => {
  beforeEach(async () => {
    records.length = 0;
    await reset();
    await configure({
      sinks: {
        recorder: withLogRedaction((record) => records.push(record)),
      },
      loggers: [
        {
          category: ["tocsin"],
          sinks: ["recorder"],
          lowestLevel: "trace",
        },
        {
          category: ["logtape", "meta"],
          sinks: [],
          lowestLevel: null,
          parentSinks: "override",
        },
      ],
      contextLocalStorage: new AsyncLocalStorage<Record<string, unknown>>(),
    });
  });

  afterEach(async () => {
    await reset();
  });

  it("records intake and delivery facts without request, payload, config, or response secrets", async () => {
    const store = await createStore();

    await store.sources.create({
      id: "source-1",
      name: "Generic source",
      provider: "generic",
      tokenHash: hashSourceToken("source-token"),
      config: {
        signingSecret: "provider-secret",
      },
    });
    await store.destinations.create({
      id: "destination-1",
      name: "Ops webhook",
      kind: "generic_webhook",
      config: {
        url: "https://example.test/webhook?token=destination-secret",
      },
    });
    await store.routes.create({
      id: "route-1",
      name: "All alerts",
      destinationIds: ["destination-1"],
    });

    const intake = new WebhookIntakeService({
      store,
      providers: createDefaultProviderRegistry(),
      now: () => now,
    });
    const accepted = await intake.acceptWebhook({
      sourceId: "source-1",
      token: "source-token",
      headers: {
        authorization: "Bearer source-token",
        "x-tocsin-provider-secret": "provider-secret",
      },
      payload: {
        id: "request-1",
        title: "Checkout unavailable",
        password: "payload-secret",
      },
      receivedAt: now,
    });
    const worker = new DeliveryWorker({
      store,
      destinations: createDefaultDestinationRegistry(),
      now: () => now,
      sendContext: {
        fetch: async () => ({
          ok: false,
          status: 503,
          text: async () => "unavailable token=response-secret password=response-password",
        }),
      },
    });

    await expect(worker.runOnce()).resolves.toMatchObject({
      claimed: 1,
      retrying: 1,
    });

    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: ["tocsin", "intake"],
          level: "info",
          properties: expect.objectContaining({
            sourceId: "source-1",
            provider: "generic",
            eventId: accepted.eventId,
            matchedRouteCount: 1,
            createdDeliveryCount: 1,
          }),
        }),
        expect.objectContaining({
          category: ["tocsin", "delivery"],
          level: "warning",
          properties: expect.objectContaining({
            eventId: accepted.eventId,
            destinationId: "destination-1",
            destinationKind: "generic_webhook",
            outcome: "retrying",
            errorKind: "http_error",
            retryHint: "retryable",
            responseStatus: 503,
          }),
        }),
      ]),
    );

    const serialized = JSON.stringify(records);

    for (const secret of [
      "source-token",
      "provider-secret",
      "payload-secret",
      "destination-secret",
      "response-secret",
      "response-password",
    ]) {
      expect(serialized).not.toContain(secret);
    }

    await store.close();
  });

  it("uses secret-safe LogTape callbacks for default worker lifecycle logging", async () => {
    const store = await createStore();
    let runnerOptions: DeliveryWorkerRunnerOptions | undefined;
    const container = createApplicationContainer({
      openStore: async () => store,
      createWorkerRunner: (options) => {
        runnerOptions = options;

        return {
          runNow: async () => null,
          getHealth: () => ({
            state: "idle",
            lastStartedAt: null,
            lastFinishedAt: null,
            lastError: null,
            lastRun: null,
          }),
          stop: () => {},
        };
      },
    });

    await container.ensureDeliveryWorkerRunner();
    runnerOptions?.onRunComplete?.({
      claimed: 2,
      reclaimed: 0,
      succeeded: 1,
      failed: 1,
      retrying: 0,
      startedAt: now,
      finishedAt: now,
    });
    runnerOptions?.onError?.(new Error("worker failed token=worker-secret"));

    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: ["tocsin", "worker", "delivery"],
          level: "warning",
          properties: expect.objectContaining({
            claimed: 2,
            succeeded: 1,
            failed: 1,
          }),
        }),
        expect.objectContaining({
          category: ["tocsin", "worker", "delivery"],
          level: "error",
          properties: expect.objectContaining({
            errorName: "Error",
            errorMessage: "worker failed token=[REDACTED]",
          }),
        }),
      ]),
    );
    expect(JSON.stringify(records)).not.toContain("worker-secret");

    await container.dispose();
  });
});

async function createStore(): Promise<SqliteStore> {
  let nextId = 0;

  return openSqliteStore({
    databasePath: ":memory:",
    now: () => now,
    ids: {
      event: () => `event-${++nextId}`,
      delivery: () => `delivery-${++nextId}`,
      attempt: () => `attempt-${++nextId}`,
    },
  });
}
