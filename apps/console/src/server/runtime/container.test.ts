import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createDefaultDestinationRegistry } from "@tocsin/destinations";
import { createDefaultProviderRegistry } from "@tocsin/providers";

import { openSqliteStore, type SqliteStore } from "#/infra/sqlite/store";
import { WebhookIntakeService } from "#/server/intake/intake.service";
import {
  createApplicationContainer,
  disposeApplicationContainer,
  getApplicationContainer,
  type ApplicationContainerOptions,
} from "#/server/runtime/container";

describe("application container", () => {
  let store: SqliteStore | undefined;

  afterEach(async () => {
    disposeApplicationContainer();
    await store?.close();
    store = undefined;
    vi.restoreAllMocks();
  });

  it("caches the default container in the ESM module until disposed", () => {
    const first = getApplicationContainer();
    const second = getApplicationContainer();

    expect(first).toBe(second);

    disposeApplicationContainer();

    const third = getApplicationContainer();

    expect(third).not.toBe(first);
  });

  it("caches long-lived dependencies and creates services through explicit factories", async () => {
    const openStore = vi.fn<() => Promise<SqliteStore>>(async () => {
      store = await openSqliteStore({
        databasePath: ":memory:",
      });

      return store;
    });
    const createProviderRegistry = vi.fn<typeof createDefaultProviderRegistry>(
      createDefaultProviderRegistry,
    );
    const createDestinationRegistry = vi.fn<typeof createDefaultDestinationRegistry>(
      createDefaultDestinationRegistry,
    );
    const createWorkerRunner: NonNullable<ApplicationContainerOptions["createWorkerRunner"]> =
      vi.fn<NonNullable<ApplicationContainerOptions["createWorkerRunner"]>>(() => ({
        runNow: async () => null,
        getHealth: () => ({
          state: "idle",
          lastStartedAt: null,
          lastFinishedAt: null,
          lastError: null,
          lastRun: null,
        }),
        stop: () => {},
      }));
    const container = createApplicationContainer({
      openStore,
      createProviderRegistry,
      createDestinationRegistry,
      createWorkerRunner,
      workerIntervalMs: 1234,
      workerBatchSize: 7,
    });

    await expect(container.getSqliteStore()).resolves.toBe(await container.getSqliteStore());
    expect(container.getProviderRegistry()).toBe(container.getProviderRegistry());
    expect(container.getDestinationRegistry()).toBe(container.getDestinationRegistry());
    expect(openStore).toHaveBeenCalledTimes(1);
    expect(createProviderRegistry).toHaveBeenCalledTimes(1);
    expect(createDestinationRegistry).toHaveBeenCalledTimes(1);

    const firstSourceService = await container.createSourceService();
    const secondSourceService = await container.createSourceService();
    const webhookIntakeService = await container.createWebhookIntakeService();

    expect(firstSourceService).not.toBe(secondSourceService);
    expect(webhookIntakeService).toBeInstanceOf(WebhookIntakeService);

    await expect(container.ensureDeliveryWorkerRunner()).resolves.toBe(
      await container.ensureDeliveryWorkerRunner(),
    );
    // Both queues share the runner factory: the delivery worker and the on-call worker.
    expect(createWorkerRunner).toHaveBeenCalledTimes(2);
    expect(createWorkerRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        intervalMs: 1234,
        limit: 7,
        worker: expect.any(Object),
      }),
    );
  });

  it("reads worker health without assembling a runner", async () => {
    const openStore = vi.fn<() => Promise<SqliteStore>>(async () => {
      store = await openSqliteStore({
        databasePath: ":memory:",
      });

      return store;
    });
    const createWorkerRunner: NonNullable<ApplicationContainerOptions["createWorkerRunner"]> =
      vi.fn<NonNullable<ApplicationContainerOptions["createWorkerRunner"]>>(() => ({
        runNow: async () => null,
        getHealth: () => ({
          state: "idle",
          lastStartedAt: null,
          lastFinishedAt: null,
          lastError: null,
          lastRun: null,
        }),
        stop: () => {},
      }));
    const container = createApplicationContainer({
      openStore,
      createWorkerRunner,
    });

    const beforeStart = await container.createWorkerHealthService();

    expect(beforeStart.getWorkerHealth()).toMatchObject({
      delivery: { started: false },
      oncall: { started: false },
    });
    expect(openStore).not.toHaveBeenCalled();
    expect(createWorkerRunner).not.toHaveBeenCalled();

    await container.ensureDeliveryWorkerRunner();
    const afterStart = await container.createWorkerHealthService();

    expect(afterStart.getWorkerHealth()).toMatchObject({
      delivery: { started: true, state: "idle" },
      oncall: { started: false },
    });
  });

  it("disposes opened long-lived dependencies", async () => {
    let openedStoreClose: ReturnType<typeof vi.fn<() => Promise<void>>> | undefined;
    const openStore = vi.fn<() => Promise<SqliteStore>>(async () => {
      const nextStore = await openSqliteStore({
        databasePath: ":memory:",
      });
      openedStoreClose = vi.spyOn(nextStore, "close");

      return nextStore;
    });
    const authDatabaseDestroy = vi.fn<() => Promise<void>>(async () => {});
    const authDatabase = { destroy: authDatabaseDestroy };
    const runner = {
      runNow: async () => null,
      getHealth: () => ({
        state: "idle" as const,
        lastStartedAt: null,
        lastFinishedAt: null,
        lastError: null,
        lastRun: null,
      }),
      stop: vi.fn<() => void>(),
    };
    const container = createApplicationContainer({
      openStore,
      createAuthDatabase: async () => authDatabase as never,
      createAuth: () =>
        ({
          handler: async () => new Response(null),
          api: {
            getSession: async () => null,
          },
        }) as never,
      createWorkerRunner: () => runner,
    });

    await container.getSqliteStore();
    await container.getAuth();

    await container.dispose();
    await container.dispose();

    // Delivery and on-call runners both wrap this fake, so dispose stops it twice.
    expect(runner.stop).toHaveBeenCalledTimes(2);
    expect(openedStoreClose).toHaveBeenCalledTimes(1);
    expect(authDatabaseDestroy).toHaveBeenCalledTimes(1);
  });

  it("clears resource references before reporting dispose errors", async () => {
    const sqliteCloseError = new Error("sqlite close failed");
    const authCloseError = new Error("auth close failed");
    const sqliteStoreClose = vi.fn<() => Promise<void>>(async () => {
      throw sqliteCloseError;
    });
    const sqliteStore = {
      close: sqliteStoreClose,
    } as unknown as SqliteStore;
    const authDatabaseDestroy = vi.fn<() => Promise<void>>(async () => {
      throw authCloseError;
    });
    const authDatabase = { destroy: authDatabaseDestroy };
    const runner = {
      runNow: async () => null,
      getHealth: () => ({
        state: "idle" as const,
        lastStartedAt: null,
        lastFinishedAt: null,
        lastError: null,
        lastRun: null,
      }),
      stop: vi.fn<() => void>(),
    };
    const container = createApplicationContainer({
      openStore: async () => sqliteStore,
      createAuthDatabase: async () => authDatabase as never,
      createAuth: () =>
        ({
          handler: async () => new Response(null),
          api: {
            getSession: async () => null,
          },
        }) as never,
      createWorkerRunner: () => runner,
    });

    await container.getSqliteStore();
    await container.getAuth();

    await expect(container.dispose()).rejects.toThrow(AggregateError);
    await expect(container.dispose()).resolves.toBeUndefined();
    // Delivery and on-call runners both wrap this fake, so dispose stops it twice.
    expect(runner.stop).toHaveBeenCalledTimes(2);
    expect(sqliteStoreClose).toHaveBeenCalledTimes(1);
    expect(authDatabaseDestroy).toHaveBeenCalledTimes(1);
  });
});
