import { encodeSchemaJson, SuppressionMatcherSchema, SuppressionSchema } from "@tocsin/core";
import type { Suppression } from "@tocsin/core";

import { toSqliteBoolean } from "#/infra/sqlite/codecs";
import type { SqliteRepositoryContext } from "#/infra/sqlite/context";
import {
  requireSuppression,
  suppressionFromRow,
} from "#/infra/sqlite/repositories/suppression/suppression.helpers";
import type {
  CreateSuppressionInput,
  SuppressionRepository,
  UpdateSuppressionInput,
} from "#/infra/sqlite/repositories/suppression/suppression.interface";

export class SqliteSuppressionRepository implements SuppressionRepository {
  constructor(private readonly context: SqliteRepositoryContext) {}

  async list(): Promise<Suppression[]> {
    const rows = await this.context.db
      .selectFrom("suppressions")
      .selectAll()
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .execute();

    return rows.map((row) => suppressionFromRow(row));
  }

  async get(id: string): Promise<Suppression | null> {
    const row = await this.context.db
      .selectFrom("suppressions")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? suppressionFromRow(row) : null;
  }

  async create(input: CreateSuppressionInput): Promise<Suppression> {
    const now = this.context.now();
    const createdAt = input.createdAt ?? now;
    const updatedAt = input.updatedAt ?? createdAt;
    const suppression = SuppressionSchema.parse({
      id: input.id ?? this.context.ids.suppression(),
      name: input.name,
      kind: input.kind,
      enabled: input.enabled ?? true,
      reason: input.reason ?? null,
      matcher: input.matcher ?? {},
      startsAt: input.startsAt ?? createdAt,
      endsAt: input.endsAt,
      createdBy: input.createdBy ?? null,
      createdAt,
      updatedAt,
    });

    await this.context.db
      .insertInto("suppressions")
      .values({
        id: suppression.id,
        name: suppression.name,
        kind: suppression.kind,
        enabled: toSqliteBoolean(suppression.enabled),
        reason: suppression.reason,
        matcher_json: encodeSchemaJson(SuppressionMatcherSchema, suppression.matcher),
        starts_at: suppression.startsAt,
        ends_at: suppression.endsAt,
        created_by: suppression.createdBy,
        created_at: suppression.createdAt,
        updated_at: suppression.updatedAt,
      })
      .execute();

    return requireSuppression(await this.get(suppression.id));
  }

  async update(id: string, input: UpdateSuppressionInput): Promise<Suppression> {
    const current = requireSuppression(await this.get(id));
    const updatedAt = input.updatedAt ?? this.context.now();
    const suppression = SuppressionSchema.parse({
      id,
      name: input.name ?? current.name,
      kind: input.kind ?? current.kind,
      enabled: input.enabled ?? current.enabled,
      // `null` is an explicit "clear the note", so only `undefined` means keep.
      reason: input.reason === undefined ? current.reason : input.reason,
      matcher: input.matcher ?? current.matcher,
      startsAt: input.startsAt ?? current.startsAt,
      endsAt: input.endsAt ?? current.endsAt,
      createdBy: current.createdBy,
      createdAt: current.createdAt,
      updatedAt,
    });

    await this.context.db
      .updateTable("suppressions")
      .set({
        name: suppression.name,
        kind: suppression.kind,
        enabled: toSqliteBoolean(suppression.enabled),
        reason: suppression.reason,
        matcher_json: encodeSchemaJson(SuppressionMatcherSchema, suppression.matcher),
        starts_at: suppression.startsAt,
        ends_at: suppression.endsAt,
        updated_at: suppression.updatedAt,
      })
      .where("id", "=", id)
      .execute();

    return requireSuppression(await this.get(id));
  }

  async delete(id: string): Promise<void> {
    requireSuppression(await this.get(id));

    await this.context.db.deleteFrom("suppressions").where("id", "=", id).execute();
  }
}
