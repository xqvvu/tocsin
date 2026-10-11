import { encodeJsonObject } from "@tocsin/core";
import type { SourceSummary } from "@tocsin/core";

import { toSqliteBoolean } from "#/infra/sqlite/codecs";
import type { SqliteRepositoryContext } from "#/infra/sqlite/context";
import {
  requireSource,
  sourceRuntimeFromRow,
  sourceSummaryFromRow,
  sourceSummaryFromRuntime,
} from "#/infra/sqlite/repositories/source/source.helpers";
import type {
  CreateSourceInput,
  SourceRepository,
  SourceRuntimeConfig,
  UpdateSourceInput,
} from "#/infra/sqlite/repositories/source/source.interface";

export class SqliteSourceRepository implements SourceRepository {
  constructor(private readonly context: SqliteRepositoryContext) {}

  async list(): Promise<SourceSummary[]> {
    const rows = await this.context.db
      .selectFrom("sources")
      .selectAll()
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .execute();

    return rows.map((row) => sourceSummaryFromRow(row));
  }

  async listEnabled(): Promise<SourceSummary[]> {
    const rows = await this.context.db
      .selectFrom("sources")
      .selectAll()
      .where("enabled", "=", 1)
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .execute();

    return rows.map((row) => sourceSummaryFromRow(row));
  }

  async get(id: string): Promise<SourceRuntimeConfig | null> {
    const row = await this.context.db
      .selectFrom("sources")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? sourceRuntimeFromRow(row) : null;
  }

  async findByTokenHash(tokenHash: string): Promise<SourceRuntimeConfig | null> {
    const row = await this.context.db
      .selectFrom("sources")
      .selectAll()
      .where("token_hash", "=", tokenHash)
      .executeTakeFirst();

    return row ? sourceRuntimeFromRow(row) : null;
  }

  async create(input: CreateSourceInput): Promise<SourceSummary> {
    const now = this.context.now();
    const id = input.id ?? this.context.ids.source();
    const createdAt = input.createdAt ?? now;
    const updatedAt = input.updatedAt ?? createdAt;

    await this.context.db
      .insertInto("sources")
      .values({
        id,
        name: input.name,
        provider: input.provider,
        token_hash: input.tokenHash,
        enabled: toSqliteBoolean(input.enabled ?? true),
        config_json: encodeJsonObject(input.config ?? {}),
        created_at: createdAt,
        updated_at: updatedAt,
      })
      .execute();

    return sourceSummaryFromRuntime(requireSource(await this.get(id)));
  }

  async update(id: string, input: UpdateSourceInput): Promise<SourceSummary> {
    const current = requireSource(await this.get(id));
    const updatedAt = input.updatedAt ?? this.context.now();

    await this.context.db
      .updateTable("sources")
      .set({
        name: input.name ?? current.name,
        provider: input.provider ?? current.provider,
        token_hash: input.tokenHash ?? current.tokenHash,
        enabled: toSqliteBoolean(input.enabled ?? current.enabled),
        config_json: encodeJsonObject(input.config ?? current.config),
        updated_at: updatedAt,
      })
      .where("id", "=", id)
      .execute();

    return sourceSummaryFromRuntime(requireSource(await this.get(id)));
  }

  setEnabled(id: string, enabled: boolean): Promise<SourceSummary> {
    return this.update(id, { enabled });
  }

  async delete(id: string): Promise<void> {
    requireSource(await this.get(id));

    await this.context.db.deleteFrom("sources").where("id", "=", id).execute();
  }
}
