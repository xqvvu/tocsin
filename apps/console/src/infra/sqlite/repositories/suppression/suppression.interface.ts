import type {
  IsoDateTimeString,
  Suppression,
  SuppressionKind,
  SuppressionMatcherInput,
} from "@tocsin/core";

import type { SqliteBoolean, SqliteJsonText } from "#/infra/sqlite/codecs";

export interface SuppressionRow {
  id: string;
  name: string;
  kind: SuppressionKind;
  enabled: SqliteBoolean;
  reason: string | null;
  matcher_json: SqliteJsonText;
  starts_at: IsoDateTimeString;
  ends_at: IsoDateTimeString;
  created_by: string | null;
  created_at: IsoDateTimeString;
  updated_at: IsoDateTimeString;
}

export interface SuppressionRepository {
  list(): Promise<Suppression[]>;
  get(id: string): Promise<Suppression | null>;
  create(input: CreateSuppressionInput): Promise<Suppression>;
  update(id: string, input: UpdateSuppressionInput): Promise<Suppression>;
  delete(id: string): Promise<void>;
}

export interface CreateSuppressionInput {
  id?: string;
  name: string;
  kind: SuppressionKind;
  enabled?: boolean;
  reason?: string | null;
  matcher?: SuppressionMatcherInput;
  startsAt?: IsoDateTimeString;
  endsAt: IsoDateTimeString;
  createdBy?: string | null;
  createdAt?: IsoDateTimeString;
  updatedAt?: IsoDateTimeString;
}

export interface UpdateSuppressionInput {
  name?: string;
  kind?: SuppressionKind;
  enabled?: boolean;
  reason?: string | null;
  matcher?: SuppressionMatcherInput;
  startsAt?: IsoDateTimeString;
  endsAt?: IsoDateTimeString;
  updatedAt?: IsoDateTimeString;
}
