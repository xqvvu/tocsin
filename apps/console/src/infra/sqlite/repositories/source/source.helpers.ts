import { decodeJsonObject, SourceProviderSchema } from "@tocsin/core";
import type { SourceSummary } from "@tocsin/core";

import { fromSqliteBoolean } from "#/infra/sqlite/codecs";
import { RecordNotFoundError } from "#/infra/sqlite/errors";
import type {
  SourceRow,
  SourceRuntimeConfig,
} from "#/infra/sqlite/repositories/source/source.interface";

export function sourceSummaryFromRow(row: SourceRow): SourceSummary {
  return {
    id: row.id,
    name: row.name,
    provider: SourceProviderSchema.parse(row.provider),
    enabled: fromSqliteBoolean(row.enabled),
  };
}

export function sourceRuntimeFromRow(row: SourceRow): SourceRuntimeConfig {
  return {
    ...sourceSummaryFromRow(row),
    tokenHash: row.token_hash,
    config: decodeJsonObject(row.config_json),
  };
}

export function sourceSummaryFromRuntime(source: SourceRuntimeConfig): SourceSummary {
  return {
    id: source.id,
    name: source.name,
    provider: source.provider,
    enabled: source.enabled,
  };
}

export function requireSource(source: SourceRuntimeConfig | null): SourceRuntimeConfig {
  if (!source) {
    throw new RecordNotFoundError("Source");
  }

  return source;
}
