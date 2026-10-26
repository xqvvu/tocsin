import { sql } from "kysely";

import type { IsoDateTimeString } from "@tocsin/core";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import type { SqliteMigration } from "#/infra/sqlite/migrate";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import type { DeliveryRepository } from "#/infra/sqlite/repositories/delivery/delivery.interface";
import { SqliteDeliveryRepository } from "#/infra/sqlite/repositories/delivery/delivery.repository";
import type { DestinationRepository } from "#/infra/sqlite/repositories/destination/destination.interface";
import { SqliteDestinationRepository } from "#/infra/sqlite/repositories/destination/destination.repository";
import type { FeishuAppRepository } from "#/infra/sqlite/repositories/feishu-app/feishu-app.interface";
import { SqliteFeishuAppRepository } from "#/infra/sqlite/repositories/feishu-app/feishu-app.repository";
import type { HistoryRepository } from "#/infra/sqlite/repositories/history/history.interface";
import { SqliteHistoryRepository } from "#/infra/sqlite/repositories/history/history.repository";
import type { IntakeRepository } from "#/infra/sqlite/repositories/intake/intake.interface";
import { SqliteIntakeRepository } from "#/infra/sqlite/repositories/intake/intake.repository";
import type { OncallRepository } from "#/infra/sqlite/repositories/oncall/oncall.interface";
import { SqliteOncallRepository } from "#/infra/sqlite/repositories/oncall/oncall.repository";
import type { RouteRepository } from "#/infra/sqlite/repositories/route/route.interface";
import { SqliteRouteRepository } from "#/infra/sqlite/repositories/route/route.repository";
import type { SessionRepository } from "#/infra/sqlite/repositories/session/session.interface";
import { SqliteSessionRepository } from "#/infra/sqlite/repositories/session/session.repository";
import type { SettingsRepository } from "#/infra/sqlite/repositories/settings/settings.interface";
import { SqliteSettingsRepository } from "#/infra/sqlite/repositories/settings/settings.repository";
import type { SourceRepository } from "#/infra/sqlite/repositories/source/source.interface";
import { SqliteSourceRepository } from "#/infra/sqlite/repositories/source/source.repository";
import type { SuppressionRepository } from "#/infra/sqlite/repositories/suppression/suppression.interface";
import { SqliteSuppressionRepository } from "#/infra/sqlite/repositories/suppression/suppression.repository";
import type { SqliteKysely } from "#/infra/sqlite/schema";
import type { StorageHealthSnapshot } from "#/infra/sqlite/storage-health";

export interface OpenSqliteStoreOptions {
  databasePath?: string;
  migrate?: boolean;
  migrationPlan?: readonly SqliteMigration[];
  now?: () => IsoDateTimeString;
  ids?: Partial<{
    source: () => string;
    destination: () => string;
    route: () => string;
    event: () => string;
    delivery: () => string;
    attempt: () => string;
    feishuApp: () => string;
    oncallPing: () => string;
    suppression: () => string;
  }>;
}

export interface SqliteStoreUnitOfWork {
  readonly sources: SourceRepository;
  readonly destinations: DestinationRepository;
  readonly routes: RouteRepository;
  readonly suppressions: SuppressionRepository;
  readonly intake: IntakeRepository;
  readonly deliveries: DeliveryRepository;
  readonly feishuApps: FeishuAppRepository;
  readonly oncall: OncallRepository;
  readonly history: HistoryRepository;
  readonly settings: SettingsRepository;
  readonly sessions: SessionRepository;
}

export interface SqliteStore extends SqliteStoreUnitOfWork {
  sqliteVersion(): Promise<string>;
  schemaVersion(): Promise<string | null>;
  /**
   * Reads file size and row counters from the live database.
   *
   * Deliberately excludes `integrity_check` / `quick_check`: those scan the
   * whole file and would block the single-process worker, so an operator-run
   * check needs its own gated entry point.
   */
  storageHealth(): Promise<StorageHealthSnapshot>;

  close(): Promise<void>;
  transaction<T>(fn: (tx: SqliteStoreUnitOfWork) => Promise<T>): Promise<T>;
}

export interface SqliteRepositorySet extends SqliteStoreUnitOfWork {}

export function createSqliteRepositories(context: SqliteRepositoryContext): SqliteRepositorySet {
  const sources = new SqliteSourceRepository(context);
  const destinations = new SqliteDestinationRepository(context);
  const routes = new SqliteRouteRepository(context);
  const suppressions = new SqliteSuppressionRepository(context);
  const intake = new SqliteIntakeRepository(context);
  const oncall = new SqliteOncallRepository(context, destinations, intake);
  const deliveries = new SqliteDeliveryRepository(
    context,
    sources,
    destinations,
    routes,
    suppressions,
    intake,
    oncall,
  );
  const feishuApps = new SqliteFeishuAppRepository(context);
  const history = new SqliteHistoryRepository(
    context,
    sources,
    intake,
    routes,
    destinations,
    deliveries,
  );
  const settings = new SqliteSettingsRepository(context);
  const sessions = new SqliteSessionRepository(context);

  return {
    sources,
    destinations,
    routes,
    suppressions,
    intake,
    deliveries,
    feishuApps,
    oncall,
    history,
    settings,
    sessions,
  };
}

export class OpenedSqliteStore implements SqliteStore {
  private readonly repositories: SqliteRepositorySet;

  constructor(
    private readonly db: SqliteKysely,
    private readonly context: SqliteRepositoryContext,
  ) {
    this.repositories = createSqliteRepositories(context);
  }

  async schemaVersion(): Promise<string | null> {
    const row = await this.db
      .selectFrom("schema_migrations")
      .select("version")
      .orderBy("version", "desc")
      .limit(1)
      .executeTakeFirst();

    return row?.version ?? null;
  }

  async sqliteVersion(): Promise<string> {
    const result = await sql<{ version: string }>`select sqlite_version() as version`.execute(
      this.db,
    );

    return result.rows[0]!.version;
  }

  async storageHealth(): Promise<StorageHealthSnapshot> {
    const pages = await sql<{
      page_count: number;
      page_size: number;
      freelist_count: number;
    }>`
      select page_count, page_size, freelist_count
      from pragma_page_count(), pragma_page_size(), pragma_freelist_count()
    `.execute(this.db);

    const counts = await sql<{
      events: number;
      deliveries: number;
      delivery_attempts: number;
      oncall_pings: number;
    }>`
      select
        (select count(*) from events) as events,
        (select count(*) from deliveries) as deliveries,
        (select count(*) from delivery_attempts) as delivery_attempts,
        (select count(*) from oncall_pings) as oncall_pings
    `.execute(this.db);

    const eventTimes = await sql<{ oldest: string | null; newest: string | null }>`
      select min(received_at) as oldest, max(received_at) as newest from events
    `.execute(this.db);

    const page = pages.rows[0]!;
    const table = counts.rows[0]!;
    const times = eventTimes.rows[0];

    return {
      pageCount: page.page_count,
      pageSizeBytes: page.page_size,
      freePageCount: page.freelist_count,
      tableCounts: {
        events: table.events,
        deliveries: table.deliveries,
        deliveryAttempts: table.delivery_attempts,
        oncallPings: table.oncall_pings,
      },
      oldestEventAt: times?.oldest ?? null,
      newestEventAt: times?.newest ?? null,
    };
  }

  get sources() {
    return this.repositories.sources;
  }

  get destinations() {
    return this.repositories.destinations;
  }

  get routes() {
    return this.repositories.routes;
  }

  get suppressions() {
    return this.repositories.suppressions;
  }

  get intake() {
    return this.repositories.intake;
  }

  get deliveries() {
    return this.repositories.deliveries;
  }

  get feishuApps() {
    return this.repositories.feishuApps;
  }

  get oncall() {
    return this.repositories.oncall;
  }

  get history() {
    return this.repositories.history;
  }

  get settings() {
    return this.repositories.settings;
  }

  get sessions() {
    return this.repositories.sessions;
  }

  async close(): Promise<void> {
    await this.db.destroy();
  }

  transaction<T>(fn: (tx: SqliteStoreUnitOfWork) => Promise<T>): Promise<T> {
    return this.context.runInTransaction(async (context) => fn(createSqliteRepositories(context)));
  }
}

export async function openSqliteStore(options: OpenSqliteStoreOptions = {}): Promise<SqliteStore> {
  const db = createSqliteDatabase({ databasePath: options.databasePath });

  if (options.migrate ?? true) {
    await migrateSqliteDatabase(db, { plan: options.migrationPlan });
  }

  const context = new SqliteRepositoryContext({
    db,
    now: options.now,
    ids: options.ids,
  });

  return new OpenedSqliteStore(db, context);
}
