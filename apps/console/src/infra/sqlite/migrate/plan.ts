import initialSchema from "#/infra/sqlite/migrate/0001_initial_schema";
import suppressions from "#/infra/sqlite/migrate/0002_suppressions";
import completeLegacySchema from "#/infra/sqlite/migrate/0003_complete_legacy_schema";
import oncallDispatchStartedAt from "#/infra/sqlite/migrate/0004_oncall_dispatch_started_at";
import deliveriesDestinationIdHealth from "#/infra/sqlite/migrate/0005_deliveries_destination_id_health";
import type { SqliteMigration } from "#/infra/sqlite/migrate/types";

export const sqliteSchemaPlan = [
  initialSchema,
  suppressions,
  completeLegacySchema,
  oncallDispatchStartedAt,
  deliveriesDestinationIdHealth,
] satisfies readonly SqliteMigration[];
