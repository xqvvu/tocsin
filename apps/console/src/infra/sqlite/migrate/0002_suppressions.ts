import { sql } from "kysely";

import { defineSqliteMigration } from "#/infra/sqlite/migrate/types";
import type { SqliteDatabaseSchema } from "#/infra/sqlite/schema";

/** Adds the suppression schema for databases applying this step directly. */
export default defineSqliteMigration<SqliteDatabaseSchema>({
  version: "0002",
  name: "suppressions",
  filename: "0002_suppressions.ts",
  async up(db) {
    await sql`
      CREATE TABLE IF NOT EXISTS suppressions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        reason TEXT,
        matcher_json TEXT NOT NULL,
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CONSTRAINT suppressions_enabled_bool_check CHECK (enabled IN (0, 1))
      )
    `.execute(db);
  },
});
