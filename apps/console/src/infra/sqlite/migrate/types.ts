import type { Kysely } from "kysely";

export type SqliteMigrationDb<Schema extends object> = Kysely<Schema>;

interface TypedSqliteMigration<Schema extends object> {
  version: string;
  name: string;
  filename: string;
  /**
   * SQLite cannot drop/rebuild a referenced parent table while FK checks are
   * active. Set only for migrations that preserve all rows and run an explicit
   * `PRAGMA foreign_key_check` before commit.
   */
  foreignKeysOff?: boolean;
  up: (db: SqliteMigrationDb<Schema>) => Promise<void>;
}

export interface SqliteMigration {
  version: string;
  name: string;
  filename: string;
  foreignKeysOff?: boolean;
  up: (db: SqliteMigrationDb<Record<string, never>>) => Promise<void>;
}

export interface MigrationResult {
  applied: SqliteMigration[];
  skipped: SqliteMigration[];
}

export function defineSqliteMigration<Schema extends object>(
  migration: TypedSqliteMigration<Schema>,
): SqliteMigration {
  return migration as unknown as SqliteMigration;
}
