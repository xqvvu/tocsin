import { ensureColumn } from "#/infra/sqlite/migrate/ensure-complete-schema";
import { defineSqliteMigration } from "#/infra/sqlite/migrate/types";
import type { SqliteDatabaseSchema } from "#/infra/sqlite/schema";

/**
 * Records the instant the worker was about to ask the provider to ring.
 *
 * A `running` ping carries no evidence of whether the call already went out, so
 * a stale reclaim could only choose between ringing twice and dropping the
 * page. The marker splits that ambiguity: null means the attempt never reached
 * the provider and is safe to retry; set means the call may have been placed
 * and must not be repeated automatically. Additive and nullable, so existing
 * rows stay valid and read as "no marker".
 *
 * Fresh databases already get the column from the baseline builders, so the
 * step is idempotent; deployed databases add it here.
 */
export default defineSqliteMigration<SqliteDatabaseSchema>({
  version: "0004",
  name: "oncall dispatch started at",
  filename: "0004_oncall_dispatch_started_at.ts",
  async up(db) {
    await ensureColumn(db, "oncall_pings", "dispatch_started_at", "TEXT");
  },
});
