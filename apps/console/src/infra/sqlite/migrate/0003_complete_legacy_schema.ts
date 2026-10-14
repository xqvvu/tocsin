import { ensureCompleteApplicationSchema } from "#/infra/sqlite/migrate/ensure-complete-schema";
import { defineSqliteMigration } from "#/infra/sqlite/migrate/types";
import type { SqliteDatabaseSchema } from "#/infra/sqlite/schema";

/**
 * Repair every table/column/index that was added to the original 0001 builder
 * after installations had already recorded it. Runs even for deployments that
 * recorded an earlier 0002 implementation, and is safe to re-run.
 */
export default defineSqliteMigration<SqliteDatabaseSchema>({
  version: "0003",
  name: "complete legacy schema",
  filename: "0003_complete_legacy_schema.ts",
  foreignKeysOff: true,
  up: ensureCompleteApplicationSchema,
});
