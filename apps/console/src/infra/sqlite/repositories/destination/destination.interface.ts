import type { DestinationKind, DestinationSummary, JsonObject } from "@tocsin/core";
import type { IsoDateTimeString } from "@tocsin/core";

import type { SqliteBoolean, SqliteJsonText } from "#/infra/sqlite/codecs";

export interface DestinationRow {
  id: string;
  name: string;
  kind: string;
  enabled: SqliteBoolean;
  config_json: SqliteJsonText;
  secret_refs_json: SqliteJsonText;
  created_at: IsoDateTimeString;
  updated_at: IsoDateTimeString;
}

export interface DestinationRepository {
  /** Full runtime rows for server-side projection into secret-safe list DTOs. */
  list(): Promise<DestinationRuntimeConfig[]>;
  listEnabled(): Promise<DestinationSummary[]>;
  get(id: string): Promise<DestinationRuntimeConfig | null>;
  create(input: CreateDestinationInput): Promise<DestinationRuntimeConfig>;
  update(id: string, input: UpdateDestinationInput): Promise<DestinationRuntimeConfig>;
  setEnabled(id: string, enabled: boolean): Promise<DestinationRuntimeConfig>;
  delete(id: string): Promise<void>;
}

export interface DestinationRuntimeConfig extends DestinationSummary {
  config: JsonObject;
  secretRefs: JsonObject;
}

export interface CreateDestinationInput {
  id?: string;
  name: string;
  kind: DestinationKind;
  enabled?: boolean;
  config?: JsonObject;
  secretRefs?: JsonObject;
  createdAt?: IsoDateTimeString;
  updatedAt?: IsoDateTimeString;
}

export interface UpdateDestinationInput {
  name?: string;
  kind?: DestinationKind;
  enabled?: boolean;
  config?: JsonObject;
  secretRefs?: JsonObject;
  updatedAt?: IsoDateTimeString;
}
