import type { DestinationRegistry } from "@tocsin/destinations";

import type { SqliteStore } from "#/infra/sqlite/store";

export interface ConfigPortabilityServiceOptions {
  store: SqliteStore;
  destinations: DestinationRegistry;
  generateSourceToken?: () => string;
}
