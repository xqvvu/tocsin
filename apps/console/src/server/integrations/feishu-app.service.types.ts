import type { FetchLike } from "@tocsin/destinations";

import type { SqliteStore } from "#/infra/sqlite/store";

export interface FeishuAppServiceOptions {
  store: SqliteStore;
  /** Injected transport used by the credential test action. */
  fetch?: FetchLike;
  /** Per-request deadline for the credential test; defaults to 10s. */
  timeoutMs?: number;
}
