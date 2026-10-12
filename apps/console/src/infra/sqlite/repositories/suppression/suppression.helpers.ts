import { decodeSchemaJson, SuppressionMatcherSchema, SuppressionSchema } from "@tocsin/core";
import type { Suppression } from "@tocsin/core";

import { fromSqliteBoolean } from "#/infra/sqlite/codecs";
import { RecordNotFoundError } from "#/infra/sqlite/errors";
import type { SuppressionRow } from "#/infra/sqlite/repositories/suppression/suppression.interface";

export function suppressionFromRow(row: SuppressionRow): Suppression {
  return SuppressionSchema.parse({
    id: row.id,
    name: row.name,
    kind: row.kind,
    enabled: fromSqliteBoolean(row.enabled),
    reason: row.reason,
    matcher: decodeSchemaJson(SuppressionMatcherSchema, row.matcher_json),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function requireSuppression(suppression: Suppression | null): Suppression {
  if (!suppression) {
    throw new RecordNotFoundError("Suppression");
  }

  return suppression;
}
