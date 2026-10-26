import { sql } from "kysely";
import type { Kysely } from "kysely";

import type { SqliteDatabaseSchema } from "#/infra/sqlite/schema";

/**
 * Converges every pre-current database to the schema used by the current app.
 * This is shared by 0002 (if pending) and 0003 (if an older 0002 was recorded).
 */
export async function ensureCompleteApplicationSchema(
  db: Kysely<SqliteDatabaseSchema>,
): Promise<void> {
  await insertDefaultSetting(db, "locale", "en-US");
  await insertDefaultSetting(db, "time_zone", "UTC");
  await createFeishuApps(db);
  await createSuppressions(db);
  await createOncallTables(db);
  await ensureOncallNullableColumns(db);
  await ensureOlderNullableColumns(db);
  await ensureDeliveriesSchema(db);
  await createCurrentIndexes(db);
  await assertForeignKeys(db);
}

async function insertDefaultSetting(db: Kysely<SqliteDatabaseSchema>, key: string, value: string) {
  await sql`
    INSERT INTO settings (key, value, updated_at)
    VALUES (${key}, ${value}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(key) DO NOTHING
  `.execute(db);
}

async function createFeishuApps(db: Kysely<SqliteDatabaseSchema>) {
  await sql`
    CREATE TABLE IF NOT EXISTS feishu_apps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      app_id TEXT NOT NULL,
      app_secret TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `.execute(db);
}

async function createSuppressions(db: Kysely<SqliteDatabaseSchema>) {
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
}

async function createOncallTables(db: Kysely<SqliteDatabaseSchema>) {
  await sql`
    CREATE TABLE IF NOT EXISTS oncall_pings (
      id TEXT PRIMARY KEY,
      delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
      destination_id TEXT NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      fingerprint TEXT NOT NULL,
      receiver TEXT NOT NULL,
      channel TEXT NOT NULL,
      state TEXT NOT NULL,
      provider_ref_type TEXT,
      provider_ref_value TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      next_attempt_at TEXT,
      last_error TEXT,
      trigger TEXT NOT NULL,
      initiated_by TEXT,
      suppress_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      fired_at TEXT,
      CONSTRAINT oncall_pings_state_check
        CHECK (state IN ('scheduled', 'running', 'fired', 'suppressed', 'failed')),
      CONSTRAINT oncall_pings_trigger_check CHECK (trigger IN ('auto', 'manual')),
      CONSTRAINT oncall_pings_attempt_count_check CHECK (attempt_count >= 0),
      CONSTRAINT oncall_pings_max_attempts_check CHECK (max_attempts > 0)
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS oncall_ping_dedupe_keys (
      fingerprint TEXT NOT NULL,
      destination_id TEXT NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
      receiver TEXT NOT NULL,
      first_ping_id TEXT NOT NULL REFERENCES oncall_pings(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      CONSTRAINT oncall_ping_dedupe_keys_primary_key
        PRIMARY KEY (fingerprint, destination_id, receiver)
    )
  `.execute(db);
}

async function ensureOncallNullableColumns(db: Kysely<SqliteDatabaseSchema>) {
  await ensureColumn(db, "oncall_pings", "provider_ref_type", "TEXT");
  await ensureColumn(db, "oncall_pings", "provider_ref_value", "TEXT");
}

async function ensureOlderNullableColumns(db: Kysely<SqliteDatabaseSchema>) {
  await ensureColumn(db, "events", "normalized_json", "TEXT NOT NULL DEFAULT '{}'");
  await ensureColumn(db, "events", "provider_metadata_json", "TEXT NOT NULL DEFAULT '{}'");
  await ensureColumn(db, "events", "raw_headers_json", "TEXT NOT NULL DEFAULT '{}'");
  await ensureColumn(db, "events", "route_matches_json", "TEXT");
  await ensureColumn(db, "destinations", "secret_refs_json", "TEXT NOT NULL DEFAULT '{}'");
}

/**
 * Adds a column only when the table does not already carry it.
 *
 * The baseline builder already creates every current column on a fresh
 * database, so later forward steps must tolerate the column being present
 * instead of failing with `duplicate column name`.
 */
export async function ensureColumn(
  db: Kysely<SqliteDatabaseSchema>,
  table: "events" | "destinations" | "oncall_pings",
  column: string,
  declaration: string,
) {
  const columns = await sql<{ name: string }>`PRAGMA table_info(${sql.raw(`"${table}"`)})`.execute(
    db,
  );
  if (columns.rows.some((row) => row.name === column)) return;
  await sql.raw(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${declaration}`).execute(db);
}

async function ensureDeliveriesSchema(db: Kysely<SqliteDatabaseSchema>) {
  const columns = await deliveryColumns(db);
  const hasRequiredCurrentFields = [
    "provider_ref_type",
    "provider_ref_value",
    "suppression_id",
    "suppressed_at",
    "suppress_reason",
  ].every((column) => columns.has(column));
  const sqlRow = await sql<{ sql: string | null }>`
    SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'deliveries'
  `.execute(db);
  const stateCheckAllowsSuppressed = sqlRow.rows[0]?.sql?.includes("'suppressed'") ?? false;

  if (!hasRequiredCurrentFields || !stateCheckAllowsSuppressed) {
    await rebuildDeliveries(db, columns);
  }
}

async function deliveryColumns(db: Kysely<SqliteDatabaseSchema>): Promise<Set<string>> {
  const result = await sql<{ name: string }>`PRAGMA table_info("deliveries")`.execute(db);
  return new Set(result.rows.map((row) => row.name));
}

async function rebuildDeliveries(db: Kysely<SqliteDatabaseSchema>, existing: Set<string>) {
  await db.schema.dropTable("deliveries_new").ifExists().execute();
  await sql`
    CREATE TABLE deliveries_new (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      destination_id TEXT NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
      route_id TEXT REFERENCES routes(id) ON DELETE CASCADE,
      state TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      next_attempt_at TEXT,
      last_error TEXT,
      rendered_payload_json TEXT,
      provider_ref_type TEXT,
      provider_ref_value TEXT,
      suppression_id TEXT REFERENCES suppressions(id) ON DELETE SET NULL,
      suppressed_at TEXT,
      suppress_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      finished_at TEXT,
      CONSTRAINT deliveries_state_check
        CHECK (state IN ('pending', 'running', 'succeeded', 'failed', 'suppressed')),
      CONSTRAINT deliveries_attempt_count_check CHECK (attempt_count >= 0),
      CONSTRAINT deliveries_max_attempts_check CHECK (max_attempts > 0)
    )
  `.execute(db);

  const required = [
    "id",
    "event_id",
    "destination_id",
    "route_id",
    "state",
    "attempt_count",
    "max_attempts",
    "next_attempt_at",
    "last_error",
    "created_at",
    "updated_at",
    "finished_at",
  ] as const;
  const missing = required.filter((column) => !existing.has(column));
  if (missing.length > 0) {
    throw new Error(`Cannot migrate deliveries: missing required columns ${missing.join(", ")}`);
  }

  const copied = [
    ...required.slice(0, 9),
    "rendered_payload_json",
    "provider_ref_type",
    "provider_ref_value",
    "suppression_id",
    "suppressed_at",
    "suppress_reason",
    ...required.slice(9),
  ] as const;
  const insertColumns = copied.map((column) => `"${column}"`).join(", ");
  const selectExpressions = copied
    .map((column) => (existing.has(column) ? `"${column}"` : "NULL"))
    .join(", ");

  await sql
    .raw(
      `INSERT INTO deliveries_new (${insertColumns}) SELECT ${selectExpressions} FROM deliveries`,
    )
    .execute(db);
  await db.schema.dropTable("deliveries").execute();
  await db.schema.alterTable("deliveries_new").renameTo("deliveries").execute();
}

async function createCurrentIndexes(db: Kysely<SqliteDatabaseSchema>) {
  await sql`CREATE INDEX IF NOT EXISTS idx_deliveries_state_next_attempt_at ON deliveries (state, next_attempt_at)`.execute(
    db,
  );
  await sql`CREATE INDEX IF NOT EXISTS idx_deliveries_event_id ON deliveries (event_id)`.execute(
    db,
  );
  await sql`CREATE INDEX IF NOT EXISTS idx_oncall_pings_state_next_attempt_at ON oncall_pings (state, next_attempt_at)`.execute(
    db,
  );
  await sql`CREATE INDEX IF NOT EXISTS idx_oncall_pings_delivery_id ON oncall_pings (delivery_id)`.execute(
    db,
  );
  await sql`CREATE INDEX IF NOT EXISTS idx_oncall_ping_dedupe_created_at ON oncall_ping_dedupe_keys (created_at)`.execute(
    db,
  );
}

async function assertForeignKeys(db: Kysely<SqliteDatabaseSchema>) {
  const violations = await sql<{
    table: string;
    rowid: number | null;
    parent: string;
    fkid: number;
  }>`PRAGMA foreign_key_check`.execute(db);
  if (violations.rows.length > 0) {
    throw new Error(
      `Application schema migration introduced foreign-key violations: ${JSON.stringify(violations.rows)}`,
    );
  }
}
