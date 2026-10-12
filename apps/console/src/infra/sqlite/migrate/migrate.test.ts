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
import { OpenedSqliteStore } from "#/infra/sqlite/store";

describe("sqlite schema plan", () => {
  it("reads the MVP baseline from the explicit TypeScript schema plan", () => {
    expect(readSqliteSchemaPlan().map((migration) => migration.filename)).toEqual([
      "0001_initial_schema.ts",
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

      expect(result.applied.map((migration) => migration.version)).toEqual(["0001"]);
      expect(await getAppliedMigrationVersions(db)).toEqual(new Set(["0001"]));
      const store = new OpenedSqliteStore(db, new SqliteRepositoryContext({ db }));

      expect(await store.schemaVersion()).toBe("0001");
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

  it("skips an already-applied baseline", async () => {
    const db = createSqliteDatabase({ databasePath: ":memory:" });

    try {
      await migrateSqliteDatabase(db);
      const result = await migrateSqliteDatabase(db);

      expect(result.applied).toHaveLength(0);
      expect(result.skipped.map((migration) => migration.version)).toEqual(["0001"]);
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
