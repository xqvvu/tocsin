import { sql, type Kysely } from "kysely";

import type { SqliteDatabaseSchema } from "#/infra/sqlite/schema";

export async function createAppTables(db: Kysely<SqliteDatabaseSchema>): Promise<void> {
  await db.schema
    .createTable("settings")
    .addColumn("key", "text", (column) => column.primaryKey())
    .addColumn("value", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .execute();

  await db
    .insertInto("settings")
    .values([
      {
        key: "schema_version",
        value: "0001",
        updated_at: sql<string>`strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      },
      {
        key: "raw_payload_retention_days",
        value: "30",
        updated_at: sql<string>`strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      },
      {
        key: "locale",
        value: "en-US",
        updated_at: sql<string>`strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      },
      {
        key: "time_zone",
        value: "UTC",
        updated_at: sql<string>`strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      },
    ])
    .execute();

  await db.schema
    .createTable("sources")
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("name", "text", (column) => column.notNull().unique())
    .addColumn("provider", "text", (column) => column.notNull())
    .addColumn("token_hash", "text", (column) => column.notNull())
    .addColumn("enabled", "integer", (column) => column.notNull().defaultTo(1))
    .addColumn("config_json", "text", (column) => column.notNull().defaultTo("{}"))
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .addCheckConstraint("sources_enabled_bool_check", sql`enabled IN (0, 1)`)
    .execute();

  await db.schema
    .createTable("feishu_apps")
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("name", "text", (column) => column.notNull().unique())
    .addColumn("app_id", "text", (column) => column.notNull())
    .addColumn("app_secret", "text", (column) => column.notNull())
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("events")
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("source_id", "text", (column) =>
      column.notNull().references("sources.id").onDelete("cascade"),
    )
    .addColumn("idempotency_key", "text")
    .addColumn("fingerprint", "text", (column) => column.notNull())
    .addColumn("severity", "text", (column) => column.notNull())
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("title", "text", (column) => column.notNull())
    .addColumn("message", "text", (column) => column.notNull())
    .addColumn("labels_json", "text", (column) => column.notNull())
    .addColumn("normalized_json", "text", (column) => column.notNull())
    .addColumn("provider_metadata_json", "text", (column) => column.notNull())
    .addColumn("raw_payload_json", "text", (column) => column.notNull())
    .addColumn("raw_headers_json", "text", (column) => column.notNull())
    .addColumn("received_at", "text", (column) => column.notNull())
    .addColumn("occurred_at", "text", (column) => column.notNull())
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("route_matches_json", "text")
    .execute();

  await db.schema
    .createTable("destinations")
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("name", "text", (column) => column.notNull().unique())
    .addColumn("kind", "text", (column) => column.notNull())
    .addColumn("enabled", "integer", (column) => column.notNull().defaultTo(1))
    .addColumn("config_json", "text", (column) => column.notNull().defaultTo("{}"))
    .addColumn("secret_refs_json", "text", (column) => column.notNull().defaultTo("{}"))
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .addCheckConstraint("destinations_enabled_bool_check", sql`enabled IN (0, 1)`)
    .execute();

  await db.schema
    .createTable("routes")
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("name", "text", (column) => column.notNull().unique())
    .addColumn("enabled", "integer", (column) => column.notNull().defaultTo(1))
    .addColumn("rule_json", "text", (column) => column.notNull())
    .addColumn("destination_ids_json", "text", (column) => column.notNull())
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .addCheckConstraint("routes_enabled_bool_check", sql`enabled IN (0, 1)`)
    .execute();

  await db.schema
    .createTable("deliveries")
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
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .addColumn("finished_at", "text")
    .addCheckConstraint(
      "deliveries_state_check",
      sql`state IN ('pending', 'running', 'succeeded', 'failed')`,
    )
    .addCheckConstraint("deliveries_attempt_count_check", sql`attempt_count >= 0`)
    .addCheckConstraint("deliveries_max_attempts_check", sql`max_attempts > 0`)
    .execute();

  await db.schema
    .createTable("delivery_attempts")
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("delivery_id", "text", (column) =>
      column.notNull().references("deliveries.id").onDelete("cascade"),
    )
    .addColumn("attempt_number", "integer", (column) => column.notNull())
    .addColumn("state", "text", (column) => column.notNull())
    .addColumn("response_status", "integer")
    .addColumn("response_body", "text")
    .addColumn("error", "text")
    .addColumn("started_at", "text", (column) => column.notNull())
    .addColumn("finished_at", "text")
    .addUniqueConstraint("delivery_attempts_delivery_attempt_number_unique", [
      "delivery_id",
      "attempt_number",
    ])
    .addCheckConstraint("delivery_attempts_attempt_number_check", sql`attempt_number > 0`)
    .addCheckConstraint(
      "delivery_attempts_state_check",
      sql`state IN ('running', 'succeeded', 'failed')`,
    )
    .execute();

  await db.schema
    .createTable("delivery_dedupe_keys")
    .addColumn("source_id", "text", (column) =>
      column.notNull().references("sources.id").onDelete("cascade"),
    )
    .addColumn("idempotency_key", "text", (column) => column.notNull())
    .addColumn("route_id", "text", (column) =>
      column.notNull().references("routes.id").onDelete("cascade"),
    )
    .addColumn("destination_id", "text", (column) =>
      column.notNull().references("destinations.id").onDelete("cascade"),
    )
    .addColumn("first_event_id", "text", (column) =>
      column.notNull().references("events.id").onDelete("cascade"),
    )
    .addColumn("created_at", "text", (column) => column.notNull())
    .addPrimaryKeyConstraint("delivery_dedupe_keys_primary_key", [
      "source_id",
      "idempotency_key",
      "route_id",
      "destination_id",
    ])
    .execute();

  await db.schema
    .createTable("oncall_pings")
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("delivery_id", "text", (column) =>
      column.notNull().references("deliveries.id").onDelete("cascade"),
    )
    .addColumn("destination_id", "text", (column) =>
      column.notNull().references("destinations.id").onDelete("cascade"),
    )
    .addColumn("event_id", "text", (column) =>
      column.notNull().references("events.id").onDelete("cascade"),
    )
    .addColumn("fingerprint", "text", (column) => column.notNull())
    .addColumn("receiver", "text", (column) => column.notNull())
    .addColumn("channel", "text", (column) => column.notNull())
    .addColumn("state", "text", (column) => column.notNull())
    .addColumn("provider_ref_type", "text")
    .addColumn("provider_ref_value", "text")
    .addColumn("attempt_count", "integer", (column) => column.notNull().defaultTo(0))
    .addColumn("max_attempts", "integer", (column) => column.notNull().defaultTo(3))
    .addColumn("next_attempt_at", "text")
    .addColumn("last_error", "text")
    .addColumn("trigger", "text", (column) => column.notNull())
    .addColumn("initiated_by", "text")
    .addColumn("suppress_reason", "text")
    .addColumn("created_at", "text", (column) => column.notNull())
    .addColumn("updated_at", "text", (column) => column.notNull())
    .addColumn("fired_at", "text")
    .addCheckConstraint(
      "oncall_pings_state_check",
      sql`state IN ('scheduled', 'running', 'fired', 'suppressed', 'failed')`,
    )
    .addCheckConstraint("oncall_pings_trigger_check", sql`trigger IN ('auto', 'manual')`)
    .addCheckConstraint("oncall_pings_attempt_count_check", sql`attempt_count >= 0`)
    .addCheckConstraint("oncall_pings_max_attempts_check", sql`max_attempts > 0`)
    .execute();

  await db.schema
    .createTable("oncall_ping_dedupe_keys")
    .addColumn("fingerprint", "text", (column) => column.notNull())
    .addColumn("destination_id", "text", (column) =>
      column.notNull().references("destinations.id").onDelete("cascade"),
    )
    .addColumn("receiver", "text", (column) => column.notNull())
    .addColumn("first_ping_id", "text", (column) =>
      column.notNull().references("oncall_pings.id").onDelete("cascade"),
    )
    .addColumn("created_at", "text", (column) => column.notNull())
    .addPrimaryKeyConstraint("oncall_ping_dedupe_keys_primary_key", [
      "fingerprint",
      "destination_id",
      "receiver",
    ])
    .execute();
}

export async function createAppIndexes(db: Kysely<SqliteDatabaseSchema>): Promise<void> {
  await db.schema
    .createIndex("idx_events_source_received_at")
    .on("events")
    .columns(["source_id", "received_at"])
    .execute();
  await db.schema
    .createIndex("idx_events_fingerprint_received_at")
    .on("events")
    .columns(["fingerprint", "received_at"])
    .execute();
  await db.schema
    .createIndex("idx_events_severity_status")
    .on("events")
    .columns(["severity", "status"])
    .execute();
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
  await db.schema
    .createIndex("idx_delivery_attempts_delivery_id")
    .on("delivery_attempts")
    .column("delivery_id")
    .execute();
  await db.schema
    .createIndex("idx_delivery_dedupe_created_at")
    .on("delivery_dedupe_keys")
    .column("created_at")
    .execute();
  await db.schema
    .createIndex("idx_oncall_pings_state_next_attempt_at")
    .on("oncall_pings")
    .columns(["state", "next_attempt_at"])
    .execute();
  await db.schema
    .createIndex("idx_oncall_pings_delivery_id")
    .on("oncall_pings")
    .column("delivery_id")
    .execute();
  await db.schema
    .createIndex("idx_oncall_ping_dedupe_created_at")
    .on("oncall_ping_dedupe_keys")
    .column("created_at")
    .execute();
}
