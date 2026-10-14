import { sql } from "kysely";

import { defineSqliteMigration } from "#/infra/sqlite/migrate/types";
import type { SqliteDatabaseSchema } from "#/infra/sqlite/schema";

/**
 * Adds suppression rules and their delivery provenance.
 *
 * The suppression feature was initially added to the `0001` schema builder.
 * Existing installations have already recorded `0001`, so they would skip the
 * new table/columns and fail as soon as the suppression list or detail page
 * queried them. Keep `0001` immutable and add this forward migration instead.
 *
 * The deliveries CHECK constraint also needs to admit `suppressed`. SQLite
 * cannot alter a CHECK constraint in place, so rebuild the table. Foreign keys
 * are disabled by the runner only for this migration; the table is rebuilt
 * without renaming the old parent first (so child FK declarations keep the
 * `deliveries` name), all rows are copied, and a foreign_key_check runs before
 * this transaction commits.
 */
export default defineSqliteMigration<SqliteDatabaseSchema>({
  version: "0002",
  name: "suppressions",
  filename: "0002_suppressions.ts",
  foreignKeysOff: true,
  async up(db) {
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
      .addCheckConstraint("suppressions_enabled_bool_check", sql`enabled IN (0, 1)`)
      .execute();

    await db.schema
      .createTable("deliveries_new")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("event_id", "text", (column) =>
        column.notNull().references("events.id").onDelete("cascade"),
      )
      .addColumn("destination_id", "text", (column) =>
        column.notNull().references("destinations.id").onDelete("cascade"),
      )
      .addColumn("route_id", "text", (column) => column.references("routes.id").onDelete("cascade"))
      .addColumn("state", "text", (column) => column.notNull())
      .addColumn("attempt_count", "integer", (column) => column.notNull().defaultTo(0))
      .addColumn("max_attempts", "integer", (column) => column.notNull().defaultTo(3))
      .addColumn("next_attempt_at", "text")
      .addColumn("last_error", "text")
      .addColumn("rendered_payload_json", "text")
      .addColumn("provider_ref_type", "text")
      .addColumn("provider_ref_value", "text")
      .addColumn("suppression_id", "text", (column) =>
        column.references("suppressions.id").onDelete("set null"),
      )
      .addColumn("suppressed_at", "text")
      .addColumn("suppress_reason", "text")
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .addColumn("finished_at", "text")
      .addCheckConstraint(
        "deliveries_state_check",
        sql`state IN ('pending', 'running', 'succeeded', 'failed', 'suppressed')`,
      )
      .addCheckConstraint("deliveries_attempt_count_check", sql`attempt_count >= 0`)
      .addCheckConstraint("deliveries_max_attempts_check", sql`max_attempts > 0`)
      .execute();

    await sql`
      INSERT INTO deliveries_new (
        id, event_id, destination_id, route_id, state, attempt_count, max_attempts,
        next_attempt_at, last_error, rendered_payload_json, provider_ref_type,
        provider_ref_value, suppression_id, suppressed_at, suppress_reason,
        created_at, updated_at, finished_at
      )
      SELECT
        id, event_id, destination_id, route_id, state, attempt_count, max_attempts,
        next_attempt_at, last_error, rendered_payload_json, provider_ref_type,
        provider_ref_value, NULL, NULL, NULL, created_at, updated_at, finished_at
      FROM deliveries
    `.execute(db);

    await db.schema.dropTable("deliveries").execute();
    await db.schema.alterTable("deliveries_new").renameTo("deliveries").execute();

    await db.schema
      .createIndex("idx_deliveries_state_next_attempt_at")
      .on("deliveries")
      .columns(["state", "next_attempt_at"])
      .execute();
    await db.schema
      .createIndex("idx_deliveries_event_id")
      .on("deliveries")
      .column("event_id")
      .execute();

    const fkViolations = await sql<{
      table: string;
      rowid: number | null;
      parent: string;
      fkid: number;
    }>`
      PRAGMA foreign_key_check
    `.execute(db);

    if (fkViolations.rows.length > 0) {
      throw new Error(
        `Suppression migration introduced foreign-key violations: ${JSON.stringify(fkViolations.rows)}`,
      );
    }
  },
});
