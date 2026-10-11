import type { SourceSummary } from "@tocsin/core";

import type { SqliteStore } from "#/infra/sqlite/store";

export interface SourceServiceOptions {
  store: SqliteStore;
  generateSourceToken?: () => string;
}

export interface CreatedSource {
  source: SourceSummary;
  token: string;
}

export interface RotatedSourceToken {
  source: SourceSummary;
  token: string;
}
