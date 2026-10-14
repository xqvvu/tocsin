import initialSchema from "#/infra/sqlite/migrate/0001_initial_schema";
import suppressions from "#/infra/sqlite/migrate/0002_suppressions";
import type { SqliteMigration } from "#/infra/sqlite/migrate/types";

export const sqliteSchemaPlan = [initialSchema, suppressions] satisfies readonly SqliteMigration[];
