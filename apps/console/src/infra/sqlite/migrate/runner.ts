import "@tanstack/react-start/server-only";
import { sql } from "kysely";

import { SqliteMigrationCompatibilityError, SqliteMigrationError } from "#/infra/sqlite/errors";
import { sqliteSchemaPlan } from "#/infra/sqlite/migrate/plan";
import type { MigrationResult, SqliteMigration } from "#/infra/sqlite/migrate/types";
import type { SqliteKysely } from "#/infra/sqlite/schema";

export interface MigrateSqliteDatabaseOptions {
  plan?: readonly SqliteMigration[];
}

export async function migrateSqliteDatabase(
  db: SqliteKysely,
  options: MigrateSqliteDatabaseOptions = {},
): Promise<MigrationResult> {
  const plan = readSqliteSchemaPlan(options.plan);

  await ensureMigrationLedger(db);

  const appliedVersions = await getAppliedMigrationVersions(db);
  assertNoUnknownAppliedMigrations(plan, appliedVersions);
  const result: MigrationResult = {
    applied: [],
    skipped: [],
  };

  for (const migration of plan) {
    if (appliedVersions.has(migration.version)) {
      result.skipped.push(migration);
      continue;
    }

    if (migration.foreignKeysOff) {
      // SQLite only honors this pragma outside a transaction. The migration must
      // therefore opt in explicitly, run its own foreign_key_check before commit,
      // and preserve dependent rows while rebuilding a referenced table.
      await sql`PRAGMA foreign_keys = OFF`.execute(db);
    }

    try {
      await db.transaction().execute(async (tx) => {
        try {
          await migration.up(tx as never);
        } catch (cause) {
          throw new SqliteMigrationError(`Failed to apply SQLite migration ${migration.filename}`, {
            cause,
          });
        }

        await tx
          .insertInto("schema_migrations")
          .values({
            version: migration.version,
            name: migration.name,
            applied_at: new Date().toISOString(),
          })
          .execute();
      });
    } finally {
      if (migration.foreignKeysOff) {
        await sql`PRAGMA foreign_keys = ON`.execute(db);
      }
    }
    appliedVersions.add(migration.version);
    result.applied.push(migration);
  }

  return result;
}

export function readSqliteSchemaPlan(
  plan: readonly SqliteMigration[] = sqliteSchemaPlan,
): SqliteMigration[] {
  if (plan.length === 0) {
    throw new SqliteMigrationError("SQLite schema plan contains no steps");
  }

  return normalizeSqliteSchemaPlan(plan);
}

export function normalizeSqliteSchemaPlan(plan: readonly SqliteMigration[]): SqliteMigration[] {
  const normalized = [...plan].sort((left, right) => left.version.localeCompare(right.version));

  assertMigrationMetadata(normalized);
  assertUniqueMigrationVersions(normalized);
  assertUniqueMigrationNames(normalized);

  return normalized;
}

export async function getAppliedMigrationVersions(db: SqliteKysely): Promise<Set<string>> {
  const rows = await db
    .selectFrom("schema_migrations")
    .select("version")
    .orderBy("version")
    .execute();

  return new Set(rows.map((row) => row.version));
}

async function ensureMigrationLedger(db: SqliteKysely): Promise<void> {
  await db.schema
    .createTable("schema_migrations")
    .ifNotExists()
    .addColumn("version", "text", (column) => column.primaryKey())
    .addColumn("name", "text", (column) => column.notNull())
    .addColumn("applied_at", "text", (column) => column.notNull())
    .execute();
}

function assertMigrationMetadata(migrations: SqliteMigration[]): void {
  const invalidMigrations = migrations.filter(
    (migration) =>
      !/^\d{4}$/.test(migration.version) ||
      !/^[a-z0-9]+(?: [a-z0-9]+)*$/.test(migration.name) ||
      migration.filename !== `${migration.version}_${migration.name.replaceAll(" ", "_")}.ts`,
  );

  if (invalidMigrations.length === 0) {
    return;
  }

  throw new SqliteMigrationError(
    `Invalid SQLite migration metadata: ${invalidMigrations
      .map((migration) => `${migration.version} ${migration.name} (${migration.filename})`)
      .join("; ")}`,
  );
}

function assertUniqueMigrationVersions(migrations: SqliteMigration[]): void {
  const filenamesByVersion = new Map<string, string[]>();

  for (const migration of migrations) {
    const filenames = filenamesByVersion.get(migration.version) ?? [];
    filenames.push(migration.filename);
    filenamesByVersion.set(migration.version, filenames);
  }

  const duplicates = [...filenamesByVersion.entries()].filter(
    ([, filenames]) => filenames.length > 1,
  );

  if (duplicates.length === 0) {
    return;
  }

  throw new SqliteMigrationError(
    `Duplicate SQLite migration versions: ${duplicates
      .map(([version, filenames]) => `${version} (${filenames.join(", ")})`)
      .join("; ")}`,
  );
}

function assertUniqueMigrationNames(migrations: SqliteMigration[]): void {
  const filenamesByName = new Map<string, string[]>();

  for (const migration of migrations) {
    const filenames = filenamesByName.get(migration.name) ?? [];
    filenames.push(migration.filename);
    filenamesByName.set(migration.name, filenames);
  }

  const duplicates = [...filenamesByName.entries()].filter(([, filenames]) => filenames.length > 1);

  if (duplicates.length === 0) {
    return;
  }

  throw new SqliteMigrationError(
    `Duplicate SQLite migration names: ${duplicates
      .map(([name, filenames]) => `${name} (${filenames.join(", ")})`)
      .join("; ")}`,
  );
}

function assertNoUnknownAppliedMigrations(
  migrations: SqliteMigration[],
  appliedVersions: Set<string>,
): void {
  const knownVersions = new Set(migrations.map((migration) => migration.version));
  const unknownVersions = [...appliedVersions].filter((version) => !knownVersions.has(version));

  if (unknownVersions.length === 0) {
    return;
  }

  throw new SqliteMigrationCompatibilityError(
    `SQLite database has applied migrations not present in this build: ${unknownVersions.join(", ")}`,
  );
}
