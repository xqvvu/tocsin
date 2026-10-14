import initialSchema from "#/infra/sqlite/migrate/0001_initial_schema";
import suppressions from "#/infra/sqlite/migrate/0002_suppressions";
import completeLegacySchema from "#/infra/sqlite/migrate/0003_complete_legacy_schema";
import type { SqliteMigration } from "#/infra/sqlite/migrate/types";

export const sqliteSchemaPlan = [
  initialSchema,
  suppressions,
  completeLegacySchema,
] satisfies readonly SqliteMigration[];
