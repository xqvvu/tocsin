import { sql } from "kysely";
import { describe, expect, it } from "vite-plus/test";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { SqliteMigrationError } from "#/infra/sqlite/errors";
import {
  defineSqliteMigration,
  getAppliedMigrationVersions,
  migrateSqliteDatabase,
  readSqliteSchemaPlan,
  sqliteSchemaPlan,
} from "#/infra/sqlite/migrate";
import betterAuthGeneratedSql from "#/infra/sqlite/migrate/better-auth.generated.sql?raw";
import { createSqliteRepositories, OpenedSqliteStore } from "#/infra/sqlite/store";

describe("sqlite schema plan", () => {
  it("reads the MVP baseline from the explicit TypeScript schema plan", () => {
    expect(readSqliteSchemaPlan().map((migration) => migration.filename)).toEqual([
      "0001_initial_schema.ts",
      "0002_suppressions.ts",
      "0003_complete_legacy_schema.ts",
    ]);
  });

  it("keeps the Better Auth generated SQL snapshot beside the Kysely builders", () => {
    expect(betterAuthGeneratedSql).toContain('create table "user"');
    expect(betterAuthGeneratedSql).toContain('"email_verified"');
    expect(betterAuthGeneratedSql).toContain('"access_token_expires_at"');
    expect(betterAuthGeneratedSql).toContain('create index "session_user_id_idx"');
    expect(betterAuthGeneratedSql).not.toContain('"emailVerified"');
    expect(betterAuthGeneratedSql).not.toContain('"userId"');
  });

  it("applies the baseline schema and records the ledger", async () => {
    const db = createSqliteDatabase({ databasePath: ":memory:" });

    try {
      const result = await migrateSqliteDatabase(db);

      expect(result.applied.map((migration) => migration.version)).toEqual([
        "0001",
        "0002",
        "0003",
      ]);
      expect(await getAppliedMigrationVersions(db)).toEqual(new Set(["0001", "0002", "0003"]));
      const store = new OpenedSqliteStore(db, new SqliteRepositoryContext({ db }));

      expect(await store.schemaVersion()).toBe("0003");
      expect((await store.settings.get()).rawPayloadRetentionDays).toBe(30);

      const tables = (
        await sql<{
          name: string;
        }>`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`.execute(db)
      ).rows.map((row) => row.name);

      expect(tables).toEqual([
        "account",
        "deliveries",
        "delivery_attempts",
        "delivery_dedupe_keys",
        "destinations",
        "events",
        "feishu_apps",
        "oncall_ping_dedupe_keys",
        "oncall_pings",
        "routes",
        "schema_migrations",
        "session",
        "settings",
        "sources",
        "suppressions",
        "user",
        "verification",
      ]);

      const userColumns = (
        await sql<{ name: string }>`PRAGMA table_info("user")`.execute(db)
      ).rows.map((row) => row.name);

      expect(userColumns).toEqual([
        "id",
        "name",
        "email",
        "email_verified",
        "image",
        "created_at",
        "updated_at",
        "role",
      ]);

      const sessionColumns = (
        await sql<{ name: string }>`PRAGMA table_info("session")`.execute(db)
      ).rows.map((row) => row.name);

      expect(sessionColumns).toContain("user_id");
      expect(sessionColumns).toContain("expires_at");
      expect(sessionColumns).not.toContain("userId");
      expect(sessionColumns).not.toContain("expiresAt");

      const accountColumns = (
        await sql<{ name: string }>`PRAGMA table_info("account")`.execute(db)
      ).rows.map((row) => row.name);

      expect(accountColumns).toContain("account_id");
      expect(accountColumns).toContain("access_token_expires_at");
      expect(accountColumns).not.toContain("accountId");
      expect(accountColumns).not.toContain("accessTokenExpiresAt");

      const eventColumns = (
        await sql<{ name: string }>`PRAGMA table_info(events)`.execute(db)
      ).rows.map((row) => row.name);

      expect(eventColumns).toContain("route_matches_json");

      const indexes = (
        await sql<{
          name: string;
        }>`SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name`.execute(db)
      ).rows.map((row) => row.name);

      expect(indexes).toContain("session_user_id_idx");
      expect(indexes).toContain("account_user_id_idx");
      expect(indexes).toContain("verification_identifier_idx");
      expect(indexes).not.toContain("session_userId_idx");
      expect(indexes).not.toContain("account_userId_idx");
    } finally {
      await db.destroy();
    }
  });

  it("upgrades a 0001 database to suppressions without losing deliveries or attempts", async () => {
    const db = createSqliteDatabase({ databasePath: ":memory:" });
    const baselineOnly = [sqliteSchemaPlan[0]!];

    try {
      // This is the shape of a customer's existing database: it has already
      // recorded 0001, and contains real data before the feature migration lands.
      await migrateSqliteDatabase(db, { plan: baselineOnly });
      await db
        .insertInto("sources")
        .values({
          id: "source-1",
          name: "Prometheus",
          provider: "generic",
          token_hash: "hash",
          created_at: "2026-10-14T00:00:00.000Z",
          updated_at: "2026-10-14T00:00:00.000Z",
        })
        .execute();
      await db
        .insertInto("destinations")
        .values({
          id: "destination-1",
          name: "Pager",
          kind: "generic_webhook",
          created_at: "2026-10-14T00:00:00.000Z",
          updated_at: "2026-10-14T00:00:00.000Z",
        })
        .execute();
      await db
        .insertInto("events")
        .values({
          id: "event-1",
          source_id: "source-1",
          fingerprint: "fingerprint-1",
          severity: "critical",
          status: "firing",
          title: "CPU high",
          message: "CPU high",
          labels_json: "{}",
          normalized_json: "{}",
          provider_metadata_json: "{}",
          raw_payload_json: "{}",
          raw_headers_json: "{}",
          received_at: "2026-10-14T00:00:00.000Z",
          occurred_at: "2026-10-14T00:00:00.000Z",
          created_at: "2026-10-14T00:00:00.000Z",
        })
        .execute();
      await db
        .insertInto("routes")
        .values({
          id: "route-1",
          name: "Critical alerts",
          enabled: 1,
          rule_json: "{}",
          destination_ids_json: '["destination-1"]',
          created_at: "2026-10-14T00:00:00.000Z",
          updated_at: "2026-10-14T00:00:00.000Z",
        })
        .execute();
      await db
        .insertInto("deliveries")
        .values({
          id: "delivery-1",
          event_id: "event-1",
          destination_id: "destination-1",
          route_id: "route-1",
          state: "pending",
          attempt_count: 1,
          max_attempts: 3,
          created_at: "2026-10-14T00:00:00.000Z",
          updated_at: "2026-10-14T00:00:00.000Z",
        })
        .execute();
      await db
        .insertInto("delivery_attempts")
        .values({
          id: "attempt-1",
          delivery_id: "delivery-1",
          attempt_number: 1,
          state: "failed",
          started_at: "2026-10-14T00:00:00.000Z",
        })
        .execute();
      // Emulate a 0001 database produced before later features were folded
      // into the already-applied baseline, plus an earlier 0002 that created
      // suppressions but did not repair Feishu/on-call tables.
      await db.schema.alterTable("deliveries").dropColumn("provider_ref_value").execute();
      await db.schema.alterTable("deliveries").dropColumn("provider_ref_type").execute();
      await db.schema.alterTable("destinations").dropColumn("secret_refs_json").execute();
      await db.schema.alterTable("events").dropColumn("route_matches_json").execute();
      await db.schema.alterTable("events").dropColumn("raw_headers_json").execute();
      await db.schema.alterTable("events").dropColumn("provider_metadata_json").execute();
      await db.schema.alterTable("events").dropColumn("normalized_json").execute();
      await db.schema.dropTable("feishu_apps").execute();
      await db.schema.dropTable("oncall_ping_dedupe_keys").execute();
      await db.schema.dropTable("oncall_pings").execute();
      await db.deleteFrom("settings").where("key", "in", ["locale", "time_zone"]).execute();
      await db
        .insertInto("schema_migrations")
        .values({ version: "0002", name: "suppressions", applied_at: "2026-10-14T00:00:00.000Z" })
        .execute();
      await db.schema
        .createTable("suppressions")
        .addColumn("id", "text", (column) => column.primaryKey())
        .addColumn("name", "text", (column) => column.notNull().unique())
        .addColumn("kind", "text", (column) => column.notNull())
        .addColumn("enabled", "integer", (column) => column.notNull().defaultTo(1))
        .addColumn("reason", "text")
        .addColumn("matcher_json", "text", (column) => column.notNull())
        .addColumn("starts_at", "text", (column) => column.notNull())
        .addColumn("ends_at", "text", (column) => column.notNull())
        .addColumn("created_by", "text")
        .addColumn("created_at", "text", (column) => column.notNull())
        .addColumn("updated_at", "text", (column) => column.notNull())
        .execute();
      await db.schema.alterTable("deliveries").addColumn("suppression_id", "text").execute();
      await db.schema.alterTable("deliveries").addColumn("suppressed_at", "text").execute();
      await db.schema.alterTable("deliveries").addColumn("suppress_reason", "text").execute();

      const result = await migrateSqliteDatabase(db);

      expect(result.applied.map((migration) => migration.version)).toEqual(["0003"]);
      expect(await getAppliedMigrationVersions(db)).toEqual(new Set(["0001", "0002", "0003"]));
      expect(
        await db
          .selectFrom("deliveries")
          .selectAll()
          .where("id", "=", "delivery-1")
          .executeTakeFirst(),
      ).toMatchObject({
        id: "delivery-1",
        event_id: "event-1",
        destination_id: "destination-1",
        route_id: "route-1",
        state: "pending",
        attempt_count: 1,
        provider_ref_type: null,
        provider_ref_value: null,
        suppression_id: null,
        suppressed_at: null,
        suppress_reason: null,
      });
      expect(
        await db
          .selectFrom("delivery_attempts")
          .selectAll()
          .where("id", "=", "attempt-1")
          .executeTakeFirst(),
      ).toMatchObject({ id: "attempt-1", delivery_id: "delivery-1", state: "failed" });

      // 0003 repairs the missing column with `DEFAULT '{}'`, so every historical
      // event keeps an empty normalized object. Reads must rebuild it from the
      // columns ingest has always written instead of throwing — `claimNext`
      // parses the event inside its transaction, so one poisoned legacy row
      // would otherwise abort the batch on every tick and starve new alerts.
      const repositories = createSqliteRepositories(new SqliteRepositoryContext({ db }));
      await expect(repositories.intake.get("event-1")).resolves.toMatchObject({
        normalized: {
          title: "CPU high",
          message: "CPU high",
          severity: "critical",
          status: "firing",
          fingerprint: "fingerprint-1",
          labels: {},
          occurredAt: "2026-10-14T00:00:00.000Z",
        },
      });
      await expect(repositories.history.getEventDetail("event-1")).resolves.toMatchObject({
        event: { id: "event-1" },
      });
      await expect(repositories.deliveries.claimNext({ limit: 10 })).resolves.toMatchObject([
        { event: { id: "event-1" } },
      ]);

      await db
        .insertInto("suppressions")
        .values({
          id: "suppression-1",
          name: "Mute CPU noise",
          kind: "silence",
          enabled: 1,
          matcher_json: "{}",
          starts_at: "2026-10-14T00:00:00.000Z",
          ends_at: "2026-10-14T01:00:00.000Z",
          created_at: "2026-10-14T00:00:00.000Z",
          updated_at: "2026-10-14T00:00:00.000Z",
        })
        .execute();
      await db
        .updateTable("deliveries")
        .set({
          state: "suppressed",
          suppression_id: "suppression-1",
          suppressed_at: "2026-10-14T00:00:00.000Z",
          suppress_reason: "matched rule",
        })
        .where("id", "=", "delivery-1")
        .execute();

      expect(
        await db
          .selectFrom("deliveries")
          .select(["state", "suppression_id", "suppressed_at", "suppress_reason"])
          .where("id", "=", "delivery-1")
          .executeTakeFirst(),
      ).toMatchObject({
        state: "suppressed",
        suppression_id: "suppression-1",
        suppress_reason: "matched rule",
      });
      expect((await sql`PRAGMA foreign_key_check`.execute(db)).rows).toEqual([]);
      const repairedTables = await sql<{ name: string }>`
        SELECT name FROM sqlite_master WHERE type = 'table'
      `.execute(db);
      const repairedTableNames = new Set(repairedTables.rows.map((row) => row.name));
      expect(repairedTableNames.has("feishu_apps")).toBe(true);
      expect(repairedTableNames.has("oncall_pings")).toBe(true);
      expect(repairedTableNames.has("oncall_ping_dedupe_keys")).toBe(true);
      const repairedEventColumns = await sql<{ name: string }>`PRAGMA table_info("events")`.execute(
        db,
      );
      const repairedEventColumnNames = new Set(repairedEventColumns.rows.map((row) => row.name));
      expect(repairedEventColumnNames.has("normalized_json")).toBe(true);
      expect(repairedEventColumnNames.has("provider_metadata_json")).toBe(true);
      expect(repairedEventColumnNames.has("raw_headers_json")).toBe(true);
      expect(repairedEventColumnNames.has("route_matches_json")).toBe(true);
      const repairedDestinationColumns = await sql<{
        name: string;
      }>`PRAGMA table_info("destinations")`.execute(db);
      expect(repairedDestinationColumns.rows.map((row) => row.name)).toContain("secret_refs_json");
      const repairedOncallColumns = await sql<{
        name: string;
      }>`PRAGMA table_info("oncall_pings")`.execute(db);
      expect(repairedOncallColumns.rows.map((row) => row.name)).toContain("provider_ref_type");
      const repairedIndexes = await sql<{ name: string }>`
        SELECT name FROM sqlite_master WHERE type = 'index'
      `.execute(db);
      const indexNames = new Set(repairedIndexes.rows.map((row) => row.name));
      expect(indexNames.has("idx_oncall_pings_state_next_attempt_at")).toBe(true);
      expect(indexNames.has("idx_oncall_pings_delivery_id")).toBe(true);
      expect(indexNames.has("idx_oncall_ping_dedupe_created_at")).toBe(true);
      expect(
        await db
          .selectFrom("settings")
          .select("value")
          .where("key", "=", "locale")
          .executeTakeFirst(),
      ).toEqual({ value: "en-US" });
      expect(
        await db
          .selectFrom("settings")
          .select("value")
          .where("key", "=", "time_zone")
          .executeTakeFirst(),
      ).toEqual({ value: "UTC" });

      // This is the same database path a suppression detail page follows:
      // `get` the rule, then list its hits through the joined history query. It
      // must work on a database that was already on 0001 before the app upgrade.
      await expect(repositories.feishuApps.list()).resolves.toEqual([]);
      await expect(repositories.oncall.listForDelivery("delivery-1")).resolves.toEqual([]);
      await expect(repositories.suppressions.get("suppression-1")).resolves.toMatchObject({
        id: "suppression-1",
        name: "Mute CPU noise",
      });
      await expect(
        repositories.history.listDeliveries({ suppressionId: "suppression-1" }),
      ).resolves.toMatchObject({
        total: 1,
        page: 1,
        items: [
          expect.objectContaining({
            id: "delivery-1",
            state: "suppressed",
            destinationName: "Pager",
          }),
        ],
      });
    } finally {
      await db.destroy();
    }
  });

  it("skips an already-applied baseline", async () => {
    const db = createSqliteDatabase({ databasePath: ":memory:" });

    try {
      await migrateSqliteDatabase(db);
      const result = await migrateSqliteDatabase(db);

      expect(result.applied).toHaveLength(0);
      expect(result.skipped.map((migration) => migration.version)).toEqual([
        "0001",
        "0002",
        "0003",
      ]);
    } finally {
      await db.destroy();
    }
  });

  it("rejects duplicate schema plan versions", () => {
    expect(() =>
      readSqliteSchemaPlan([
        sqliteSchemaPlan[0]!,
        defineSqliteMigration({
          version: "0001",
          name: "duplicate",
          filename: "0001_duplicate.ts",
          async up() {},
        }),
      ]),
    ).toThrow(SqliteMigrationError);
  });

  it("rejects duplicate schema plan names", () => {
    expect(() =>
      readSqliteSchemaPlan([
        sqliteSchemaPlan[0]!,
        defineSqliteMigration({
          version: "0002",
          name: "initial schema",
          filename: "0002_initial_schema.ts",
          async up() {},
        }),
      ]),
    ).toThrow(SqliteMigrationError);
  });

  it("rejects schema plan steps with mismatched metadata", () => {
    expect(() =>
      readSqliteSchemaPlan([
        defineSqliteMigration({
          version: "0001",
          name: "initial schema",
          filename: "0001_wrong_filename.ts",
          async up() {},
        }),
      ]),
    ).toThrow(/Invalid SQLite migration metadata/);
  });

  it("rejects an empty schema plan", async () => {
    const db = createSqliteDatabase({ databasePath: ":memory:" });

    try {
      await expect(migrateSqliteDatabase(db, { plan: [] })).rejects.toThrow(/contains no steps/);
    } finally {
      await db.destroy();
    }
  });

  it("rolls back a schema plan step when any statement fails", async () => {
    const db = createSqliteDatabase({ databasePath: ":memory:" });
    const failingMigration = defineSqliteMigration({
      version: "0001",
      name: "failing migration",
      filename: "0001_failing_migration.ts",
      async up(database) {
        await sql`CREATE TABLE should_rollback (id TEXT)`.execute(database);
        await sql`INSERT INTO missing_table (id) VALUES ('x')`.execute(database);
      },
    });

    try {
      await expect(migrateSqliteDatabase(db, { plan: [failingMigration] })).rejects.toThrow(
        SqliteMigrationError,
      );

      const table = await sql<{ name: string }>`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name = 'should_rollback'
      `.execute(db);
      const appliedVersions = await getAppliedMigrationVersions(db);

      expect(table.rows).toEqual([]);
      expect(appliedVersions).toEqual(new Set());
    } finally {
      await db.destroy();
    }
  });

  it("rejects databases with schema versions newer than this build knows about", async () => {
    const db = createSqliteDatabase({ databasePath: ":memory:" });

    try {
      await migrateSqliteDatabase(db);
      await db
        .insertInto("schema_migrations")
        .values({
          version: "9999",
          name: "future migration",
          applied_at: "2026-06-22T00:00:00.000Z",
        })
        .execute();

      await expect(migrateSqliteDatabase(db)).rejects.toThrow(SqliteMigrationError);
    } finally {
      await db.destroy();
    }
  });
});
