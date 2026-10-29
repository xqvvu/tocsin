import type { DestinationRegistry } from "@tocsin/destinations";
import type { ProviderRegistry } from "@tocsin/providers";

import type { SqliteStore } from "#/infra/sqlite/store";

export interface SourceRehearsalServiceOptions {
  store: SqliteStore;
  providers: ProviderRegistry;
  destinations: DestinationRegistry;
  /** Injectable clock so tests can pin the rehearsal timestamp. */
  now?: () => string;
  /**
   * Idempotency dedupe window to check, in milliseconds. Defaults to five
   * minutes, matching `WebhookIntakeService`; the two must describe the same
   * window or the rehearsal would promise a delivery production skips.
   */
  dedupeWindowMs?: number;
}
