import { sql } from "kysely";

import { defineSqliteMigration } from "#/infra/sqlite/migrate/types";
import type { SqliteDatabaseSchema } from "#/infra/sqlite/schema";

/**
 * Covers the destination-health aggregate that the destinations list runs.
 *
 * `destinationDeliveryHealth` groups the whole deliveries table by
 * destination_id and reads state, finished_at and created_at inside the
 * aggregates, so a single-column index would only add a table lookup per row:
 * SQLite measured the destination-only variant slower than the full scan. The
 * four columns keep the scan index-only, drop the temp B-tree for GROUP BY, and
 * the leading column still serves foreign-key cascade lookups.
 *
 * Additive and idempotent: fresh databases get the same index from the baseline
 * builders, deployed databases add it here.
 */
export default defineSqliteMigration<SqliteDatabaseSchema>({
  version: "0005",
  name: "deliveries destination id health",
  filename: "0005_deliveries_destination_id_health.ts",
  async up(db) {
    await sql`CREATE INDEX IF NOT EXISTS idx_deliveries_destination_id_health ON deliveries (destination_id, state, finished_at, created_at)`.execute(
      db,
    );
  },
});
