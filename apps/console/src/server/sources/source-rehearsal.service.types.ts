import type { DestinationRegistry } from "@tocsin/destinations";
import type { ProviderRegistry } from "@tocsin/providers";

import type { SqliteStore } from "#/infra/sqlite/store";

export interface SourceRehearsalServiceOptions {
  store: SqliteStore;
  providers: ProviderRegistry;
  destinations: DestinationRegistry;
  /** Injectable clock so tests can pin the rehearsal timestamp. */
  now?: () => string;
}
