import "@tanstack/react-start/server-only";
import { getLogger } from "@logtape/logtape";
import { betterAuth } from "better-auth";

import {
  createDefaultDestinationRegistry,
  createDefaultUrgencyRegistry,
  type DestinationRegistry,
  type UrgencyRegistry,
} from "@tocsin/destinations";
import { createDefaultProviderRegistry, type ProviderRegistry } from "@tocsin/providers";

import { env } from "#/env";
import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import type { SqliteKysely } from "#/infra/sqlite/schema";
import { openSqliteStore, type SqliteStore } from "#/infra/sqlite/store";
import { requireBetterAuthBaseUrl, requireBetterAuthSecret } from "#/lib/auth-config";
import { createBaseBetterAuthOptions } from "#/lib/auth-options";
import { assignOwnerRoleBeforeUserCreate, hasRegisteredUsers } from "#/lib/auth-owner-bootstrap";
import { AppSettingsService } from "#/server/configuration/app-settings.service";
import { ConfigPortabilityService } from "#/server/configuration/config-portability.service";
import type { ConfigPortabilityServiceOptions } from "#/server/configuration/config-portability.service.types";
import { DeliveryWorker } from "#/server/deliveries/delivery-worker.service";
import type {
  DeliveryWorkerOptions,
  DeliveryWorkerRunResult,
} from "#/server/deliveries/delivery-worker.service.types";
import { DestinationService } from "#/server/destinations/destination.service";
import type { DestinationServiceOptions } from "#/server/destinations/destination.service.types";
import { WebhookIntakeService, createRawPayloadSweepGate } from "#/server/intake/intake.service";
import type { WebhookIntakeServiceOptions } from "#/server/intake/intake.service.types";
import { createDestinationConfigResolver } from "#/server/integrations/destination-config-resolver";
import { FeishuAppService } from "#/server/integrations/feishu-app.service";
import type { FeishuAppServiceOptions } from "#/server/integrations/feishu-app.service.types";
import { OncallWorker } from "#/server/oncall/oncall-worker.service";
import type { OncallWorkerOptions } from "#/server/oncall/oncall-worker.service.types";
import { OncallService } from "#/server/oncall/oncall.service";
import type { OncallServiceOptions } from "#/server/oncall/oncall.service.types";
import { EventReplayService } from "#/server/operations/event-replay.service";
import type { EventReplayServiceOptions } from "#/server/operations/event-replay.service.types";
import { OperationsService } from "#/server/operations/operations.service";
import type { OperationsServiceOptions } from "#/server/operations/operations.service.types";
import { RouteService } from "#/server/routes/route.service";
import type { BetterAuthSession } from "#/server/runtime/dashboard-session";
import {
  createDeliveryWorkerRunner,
  type DeliveryWorkerRunner,
  type DeliveryWorkerRunnerOptions,
} from "#/server/runtime/delivery-worker-runner";
import { safeErrorProperties } from "#/server/runtime/log-safety";
import { RuntimeInformationService } from "#/server/runtime/runtime-information.service";
import type { RuntimeInformationServiceOptions } from "#/server/runtime/runtime-information.service.types";
import { StorageHealthService } from "#/server/runtime/storage-health.service";
import type { StorageHealthServiceOptions } from "#/server/runtime/storage-health.service.types";
import { SourceService } from "#/server/sources/source.service";
import type { SourceServiceOptions } from "#/server/sources/source.service.types";
import { SuppressionService } from "#/server/suppressions/suppression.service";
import type { SuppressionServiceOptions } from "#/server/suppressions/suppression.service.types";

const deliveryWorkerLogger = getLogger(["tocsin", "worker", "delivery"]);
const oncallWorkerLogger = getLogger(["tocsin", "worker", "oncall"]);

export interface AuthServer {
  handler(request: Request): Promise<Response>;
  api: {
    /**
     * Better Auth's own session lookup, so the result is Better Auth's session —
     * including `session.token`. Callers must project it (`toDashboardSession`)
     * before it leaves the server; the type keeps that visible rather than
     * handing back a shape that looks safe to return as-is.
     */
    getSession(input: { headers: HeadersInit }): Promise<BetterAuthSession | null>;
  };
}

export interface ApplicationContainer {
  getSqliteStore(): Promise<SqliteStore>;
  getProviderRegistry(): ProviderRegistry;
  getDestinationRegistry(): DestinationRegistry;
  getUrgencyRegistry(): UrgencyRegistry;
  createSourceService(
    options?: Partial<Omit<SourceServiceOptions, "store">>,
  ): Promise<SourceService>;
  createDestinationService(
    options?: Partial<Omit<DestinationServiceOptions, "store" | "destinations">>,
  ): Promise<DestinationService>;
  createRouteService(): Promise<RouteService>;
  createSuppressionService(
    options?: Partial<Omit<SuppressionServiceOptions, "store">>,
  ): Promise<SuppressionService>;
  createFeishuAppService(
    options?: Partial<Omit<FeishuAppServiceOptions, "store">>,
  ): Promise<FeishuAppService>;
  createAppSettingsService(): Promise<AppSettingsService>;
  createRuntimeInformationService(
    options?: Partial<Omit<RuntimeInformationServiceOptions, "store">>,
  ): Promise<RuntimeInformationService>;
  createStorageHealthService(
    options?: Partial<Omit<StorageHealthServiceOptions, "store">>,
  ): Promise<StorageHealthService>;
  createConfigPortabilityService(
    options?: Partial<Omit<ConfigPortabilityServiceOptions, "store" | "destinations">>,
  ): Promise<ConfigPortabilityService>;
  createWebhookIntakeService(
    options?: Partial<Omit<WebhookIntakeServiceOptions, "store" | "providers">>,
  ): Promise<WebhookIntakeService>;
  createDeliveryWorker(
    options?: Partial<Omit<DeliveryWorkerOptions, "store" | "destinations">>,
  ): Promise<DeliveryWorker>;
  createOncallService(
    options?: Partial<Omit<OncallServiceOptions, "store">>,
  ): Promise<OncallService>;
  createOncallWorker(
    options?: Partial<Omit<OncallWorkerOptions, "store" | "urgency">>,
  ): Promise<OncallWorker>;
  createEventReplayService(
    options?: Partial<Omit<EventReplayServiceOptions, "store">>,
  ): Promise<EventReplayService>;
  createOperationsService(): Promise<OperationsService>;
  ensureDeliveryWorkerRunner(): Promise<DeliveryWorkerRunner>;
  ensureOncallWorkerRunner(): Promise<DeliveryWorkerRunner>;
  getBetterAuthDatabase(): Promise<SqliteKysely>;
  hasRegisteredUsers(): Promise<boolean>;
  getAuth(): Promise<AuthServer>;
  dispose(): Promise<void>;
}

export interface ApplicationContainerOptions {
  openStore?: () => Promise<SqliteStore>;
  createProviderRegistry?: () => ProviderRegistry;
  createDestinationRegistry?: () => DestinationRegistry;
  createUrgencyRegistry?: () => UrgencyRegistry;
  createAuthDatabase?: () => Promise<SqliteKysely>;
  createAuth?: (input: { db: SqliteKysely }) => AuthServer;
  createWorkerRunner?: (options: DeliveryWorkerRunnerOptions) => DeliveryWorkerRunner;
  workerIntervalMs?: number;
  workerBatchSize?: number;
  workerStaleRunningMs?: number;
  destinationTimeoutMs?: number;
  onWorkerRunComplete?: (result: DeliveryWorkerRunResult) => void;
  onWorkerError?: (error: unknown) => void;
  onOncallWorkerRunComplete?: (result: DeliveryWorkerRunResult) => void;
  onOncallWorkerError?: (error: unknown) => void;
}

let applicationContainer: ApplicationContainer | undefined;

export function getApplicationContainer(): ApplicationContainer {
  applicationContainer ??= createApplicationContainer();

  return applicationContainer;
}

export function disposeApplicationContainer(): void {
  const container = applicationContainer;

  applicationContainer = undefined;
  void container?.dispose();
}

export function createApplicationContainer(
  options: ApplicationContainerOptions = {},
): ApplicationContainer {
  let sqliteStore: SqliteStore | undefined;
  let sqliteStorePromise: Promise<SqliteStore> | undefined;
  let providers: ProviderRegistry | undefined;
  let destinations: DestinationRegistry | undefined;
  let urgency: UrgencyRegistry | undefined;
  let authDatabase: SqliteKysely | undefined;
  let authDatabasePromise: Promise<SqliteKysely> | undefined;
  let auth: AuthServer | undefined;
  let authPromise: Promise<AuthServer> | undefined;
  let runner: DeliveryWorkerRunner | undefined;
  let runnerPromise: Promise<DeliveryWorkerRunner> | undefined;
  let oncallRunner: DeliveryWorkerRunner | undefined;
  let oncallRunnerPromise: Promise<DeliveryWorkerRunner> | undefined;
  // Shared by every intake service this container builds: it is created per
  // request, so the sweep latch has to live above the instances.
  const rawPayloadSweepGate = createRawPayloadSweepGate();

  const openStore =
    options.openStore ??
    (() =>
      openSqliteStore({
        databasePath: env.TOCSIN_DATABASE_PATH,
      }));
  const createProviderRegistry = options.createProviderRegistry ?? createDefaultProviderRegistry;
  const createDestinationRegistry =
    options.createDestinationRegistry ?? createDefaultDestinationRegistry;
  const createUrgencyRegistry = options.createUrgencyRegistry ?? createDefaultUrgencyRegistry;
  const createAuthDatabase = options.createAuthDatabase ?? createDefaultBetterAuthDatabase;
  const createAuth = options.createAuth ?? createDefaultAuth;
  const createWorkerRunner = options.createWorkerRunner ?? createDeliveryWorkerRunner;
  const workerIntervalMs = options.workerIntervalMs ?? env.TOCSIN_WORKER_INTERVAL_MS;
  const workerBatchSize = options.workerBatchSize ?? env.TOCSIN_WORKER_BATCH_SIZE;
  const workerStaleRunningMs = options.workerStaleRunningMs ?? env.TOCSIN_WORKER_STALE_RUNNING_MS;
  const destinationTimeoutMs = options.destinationTimeoutMs ?? env.TOCSIN_DESTINATION_TIMEOUT_MS;
  const onWorkerRunComplete = options.onWorkerRunComplete ?? logWorkerRunComplete;
  const onWorkerError = options.onWorkerError ?? logWorkerError;
  const onOncallWorkerRunComplete = options.onOncallWorkerRunComplete ?? logOncallWorkerRunComplete;
  const onOncallWorkerError = options.onOncallWorkerError ?? logOncallWorkerError;

  const container: ApplicationContainer = {
    async getSqliteStore() {
      const store = await getOrOpenSqliteStore();
      void container.ensureDeliveryWorkerRunner();
      void container.ensureOncallWorkerRunner();

      return store;
    },

    getProviderRegistry() {
      providers ??= createProviderRegistry();

      return providers;
    },

    getDestinationRegistry() {
      destinations ??= createDestinationRegistry();

      return destinations;
    },

    getUrgencyRegistry() {
      urgency ??= createUrgencyRegistry();

      return urgency;
    },

    async createSourceService(serviceOptions = {}) {
      return new SourceService({
        store: await container.getSqliteStore(),
        ...serviceOptions,
      });
    },

    async createDestinationService(serviceOptions = {}) {
      const store = await container.getSqliteStore();

      return new DestinationService({
        store,
        destinations: container.getDestinationRegistry(),
        resolveDestinationConfig: createDestinationConfigResolver({ store }),
        destinationSendContext: { timeoutMs: destinationTimeoutMs },
        ...serviceOptions,
      });
    },

    async createRouteService() {
      return new RouteService({ store: await container.getSqliteStore() });
    },

    async createSuppressionService(serviceOptions = {}) {
      return new SuppressionService({
        store: await container.getSqliteStore(),
        ...serviceOptions,
      });
    },

    async createFeishuAppService(serviceOptions = {}) {
      return new FeishuAppService({
        store: await container.getSqliteStore(),
        timeoutMs: destinationTimeoutMs,
        ...serviceOptions,
      });
    },

    async createAppSettingsService() {
      return new AppSettingsService({ store: await container.getSqliteStore() });
    },

    async createStorageHealthService(serviceOptions = {}) {
      return new StorageHealthService({
        store: await container.getSqliteStore(),
        ...serviceOptions,
      });
    },

    async createRuntimeInformationService(serviceOptions = {}) {
      return new RuntimeInformationService({
        store: await container.getSqliteStore(),
        limits: {
          destinationTimeoutMs,
          maxWebhookBytes: env.TOCSIN_MAX_WEBHOOK_BYTES,
          workerBatchSize,
          workerIntervalMs,
          workerStaleRunningMs,
        },
        logging: {
          format: env.TOCSIN_LOG_FORMAT,
          level: env.TOCSIN_LOG_LEVEL,
        },
        ...serviceOptions,
      });
    },

    async createConfigPortabilityService(serviceOptions = {}) {
      return new ConfigPortabilityService({
        store: await container.getSqliteStore(),
        destinations: container.getDestinationRegistry(),
        ...serviceOptions,
      });
    },

    async createWebhookIntakeService(serviceOptions = {}) {
      return new WebhookIntakeService({
        store: await container.getSqliteStore(),
        providers: container.getProviderRegistry(),
        sweepGate: rawPayloadSweepGate,
        ...serviceOptions,
      });
    },

    async createDeliveryWorker(workerOptions = {}) {
      const store = await getOrOpenSqliteStore();
      // Built straight from the open store so creating the delivery worker does
      // not eagerly start the on-call runner as a side effect.
      const oncall = new OncallService({ store });

      return new DeliveryWorker({
        store,
        destinations: container.getDestinationRegistry(),
        staleRunningTimeoutMs: workerStaleRunningMs,
        resolveDestinationConfig: createDestinationConfigResolver({ store }),
        sendContext: { timeoutMs: destinationTimeoutMs },
        triggerPings: (input) => oncall.triggerPingsForDelivery(input),
        ...workerOptions,
      });
    },

    async createOncallService(serviceOptions = {}) {
      return new OncallService({
        store: await container.getSqliteStore(),
        // Manual pages dispatch immediately through a one-off worker run so the
        // operator gets instant feedback; whatever does not fire stays queued.
        dispatchNow: async (now) => {
          const worker = await container.createOncallWorker();
          await worker.runOnce({ now });
        },
        ...serviceOptions,
      });
    },

    async createOncallWorker(workerOptions = {}) {
      const store = await getOrOpenSqliteStore();

      return new OncallWorker({
        store,
        urgency: container.getUrgencyRegistry(),
        staleRunningTimeoutMs: workerStaleRunningMs,
        resolveDestinationConfig: createDestinationConfigResolver({ store }),
        sendContext: { timeoutMs: destinationTimeoutMs },
        ...workerOptions,
      });
    },

    async createEventReplayService(serviceOptions = {}) {
      return new EventReplayService({
        store: await container.getSqliteStore(),
        ...serviceOptions,
      });
    },

    async createOperationsService() {
      const options: OperationsServiceOptions = {
        store: await container.getSqliteStore(),
        oncall: await container.createOncallService(),
      };

      return new OperationsService(options);
    },

    ensureDeliveryWorkerRunner() {
      runnerPromise ??= (async () => {
        runner ??= createWorkerRunner({
          worker: await container.createDeliveryWorker(),
          intervalMs: workerIntervalMs,
          limit: workerBatchSize,
          onRunComplete: onWorkerRunComplete,
          onError: onWorkerError,
        });

        return runner;
      })();

      return runnerPromise;
    },

    ensureOncallWorkerRunner() {
      oncallRunnerPromise ??= (async () => {
        oncallRunner ??= createWorkerRunner({
          worker: await container.createOncallWorker(),
          intervalMs: workerIntervalMs,
          limit: workerBatchSize,
          onRunComplete: onOncallWorkerRunComplete,
          onError: onOncallWorkerError,
        });

        return oncallRunner;
      })();

      return oncallRunnerPromise;
    },

    async getBetterAuthDatabase() {
      authDatabase ??= await getOrCreateAuthDatabase();

      return authDatabase;
    },

    async hasRegisteredUsers() {
      return hasRegisteredUsers(await container.getBetterAuthDatabase());
    },

    getAuth() {
      authPromise ??= (async () => {
        auth ??= createAuth({
          db: await container.getBetterAuthDatabase(),
        });

        return auth;
      })();

      return authPromise;
    },

    async dispose() {
      const currentRunner = runner;
      const currentOncallRunner = oncallRunner;
      const currentSqliteStore = sqliteStore;
      const currentAuthDatabase = authDatabase;
      const errors: unknown[] = [];

      runner = undefined;
      runnerPromise = undefined;
      oncallRunner = undefined;
      oncallRunnerPromise = undefined;
      sqliteStore = undefined;
      sqliteStorePromise = undefined;
      providers = undefined;
      destinations = undefined;
      urgency = undefined;
      authDatabase = undefined;
      authDatabasePromise = undefined;
      auth = undefined;
      authPromise = undefined;

      tryDispose(() => currentRunner?.stop(), errors);
      tryDispose(() => currentOncallRunner?.stop(), errors);
      await tryDisposeAsync(() => currentSqliteStore?.close(), errors);
      await tryDisposeAsync(() => currentAuthDatabase?.destroy(), errors);

      if (errors.length === 1) {
        throw errors[0];
      }

      if (errors.length > 1) {
        throw new AggregateError(errors, "Failed to dispose application container");
      }
    },
  };

  async function getOrOpenSqliteStore(): Promise<SqliteStore> {
    sqliteStorePromise ??= openStore().then((store) => {
      sqliteStore = store;
      return store;
    });

    return sqliteStorePromise;
  }

  async function getOrCreateAuthDatabase(): Promise<SqliteKysely> {
    authDatabasePromise ??= createAuthDatabase().then((db) => {
      authDatabase = db;
      return db;
    });

    return authDatabasePromise;
  }

  return container;
}

function tryDispose(dispose: () => void, errors: unknown[]): void {
  try {
    dispose();
  } catch (error) {
    errors.push(error);
  }
}

async function tryDisposeAsync(
  dispose: () => Promise<void> | void | undefined,
  errors: unknown[],
): Promise<void> {
  try {
    await dispose();
  } catch (error) {
    errors.push(error);
  }
}

const hot = (
  import.meta as ImportMeta & {
    hot?: {
      dispose(callback: () => void): void;
    };
  }
).hot;

hot?.dispose(disposeApplicationContainer);

function logWorkerRunComplete(result: DeliveryWorkerRunResult): void {
  if (result.claimed === 0 && result.reclaimed === 0) {
    return;
  }

  const properties = {
    claimed: result.claimed,
    reclaimed: result.reclaimed,
    succeeded: result.succeeded,
    failed: result.failed,
    retrying: result.retrying,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
  };

  if (result.failed > 0) {
    deliveryWorkerLogger.warn(
      "Delivery worker completed with {failed} failed and {retrying} retrying",
      properties,
    );
  } else {
    deliveryWorkerLogger.info(
      "Delivery worker completed with {succeeded} succeeded and {retrying} retrying",
      properties,
    );
  }
}

function logWorkerError(error: unknown): void {
  deliveryWorkerLogger.error("Delivery worker run failed", safeErrorProperties(error));
}

function logOncallWorkerRunComplete(result: DeliveryWorkerRunResult): void {
  if (result.claimed === 0 && result.reclaimed === 0) {
    return;
  }

  const properties = {
    claimed: result.claimed,
    reclaimed: result.reclaimed,
    fired: result.succeeded,
    failed: result.failed,
    retrying: result.retrying,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
  };

  if (result.failed > 0) {
    oncallWorkerLogger.warn(
      "On-call worker completed with {failed} failed and {retrying} retrying",
      properties,
    );
  } else {
    oncallWorkerLogger.info(
      "On-call worker completed with {fired} fired and {retrying} retrying",
      properties,
    );
  }
}

function logOncallWorkerError(error: unknown): void {
  oncallWorkerLogger.error("On-call worker run failed", safeErrorProperties(error));
}

async function createDefaultBetterAuthDatabase(): Promise<SqliteKysely> {
  const db = createSqliteDatabase({
    databasePath: env.TOCSIN_DATABASE_PATH,
  });

  await migrateSqliteDatabase(db);

  return db;
}

function createDefaultAuth(input: { db: SqliteKysely }): AuthServer {
  return betterAuth({
    ...createBaseBetterAuthOptions(),
    baseURL: requireBetterAuthBaseUrl(env.BETTER_AUTH_URL ?? env.SERVER_URL, process.env, {
      allowedHosts: env.BETTER_AUTH_ALLOWED_HOSTS,
    }),
    database: {
      db: input.db,
      type: "sqlite",
      casing: "snake",
    },
    trustedOrigins: env.BETTER_AUTH_TRUSTED_ORIGINS,
    databaseHooks: {
      user: {
        create: {
          before: async (user) =>
            assignOwnerRoleBeforeUserCreate(user, {
              hasRegisteredUsers: () => hasRegisteredUsers(input.db),
            }),
        },
      },
    },
    secret: requireBetterAuthSecret(env.BETTER_AUTH_SECRET),
  }) as AuthServer;
}
