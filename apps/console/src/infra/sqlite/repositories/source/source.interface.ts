import type { JsonObject, SourceProvider, SourceSummary } from "@tocsin/core";
import type { IsoDateTimeString } from "@tocsin/core";

import type { SqliteBoolean, SqliteJsonText } from "#/infra/sqlite/codecs";

export interface SourceRow {
  id: string;
  name: string;
  provider: string;
  token_hash: string;
  enabled: SqliteBoolean;
  config_json: SqliteJsonText;
  created_at: IsoDateTimeString;
  updated_at: IsoDateTimeString;
}

export interface SourceRepository {
  list(): Promise<SourceSummary[]>;
  listEnabled(): Promise<SourceSummary[]>;
  get(id: string): Promise<SourceRuntimeConfig | null>;
  findByTokenHash(tokenHash: string): Promise<SourceRuntimeConfig | null>;
  create(input: CreateSourceInput): Promise<SourceSummary>;
  update(id: string, input: UpdateSourceInput): Promise<SourceSummary>;
  setEnabled(id: string, enabled: boolean): Promise<SourceSummary>;
  delete(id: string): Promise<void>;
}

export interface SourceRuntimeConfig extends SourceSummary {
  tokenHash: string;
  config: JsonObject;
}

export interface CreateSourceInput {
  id?: string;
  name: string;
  provider: SourceProvider;
  tokenHash: string;
  enabled?: boolean;
  config?: JsonObject;
  createdAt?: IsoDateTimeString;
  updatedAt?: IsoDateTimeString;
}

export interface UpdateSourceInput {
  name?: string;
  provider?: SourceProvider;
  tokenHash?: string;
  enabled?: boolean;
  config?: JsonObject;
  updatedAt?: IsoDateTimeString;
}
