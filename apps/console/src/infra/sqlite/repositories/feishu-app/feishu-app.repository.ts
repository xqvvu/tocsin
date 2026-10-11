import type { FeishuApp } from "@tocsin/core";

import type { SqliteRepositoryContext } from "#/infra/sqlite/context";
import {
  feishuAppFromRow,
  requireFeishuApp,
} from "#/infra/sqlite/repositories/feishu-app/feishu-app.helpers";
import type {
  CreateFeishuAppInput,
  FeishuAppRepository,
  UpdateFeishuAppInput,
} from "#/infra/sqlite/repositories/feishu-app/feishu-app.interface";

export class SqliteFeishuAppRepository implements FeishuAppRepository {
  constructor(private readonly context: SqliteRepositoryContext) {}

  async list(): Promise<FeishuApp[]> {
    const rows = await this.context.db
      .selectFrom("feishu_apps")
      .selectAll()
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .execute();

    return rows.map((row) => feishuAppFromRow(row));
  }

  async get(id: string): Promise<FeishuApp | null> {
    const row = await this.context.db
      .selectFrom("feishu_apps")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? feishuAppFromRow(row) : null;
  }

  async create(input: CreateFeishuAppInput): Promise<FeishuApp> {
    const now = this.context.now();
    const id = input.id ?? this.context.ids.feishuApp();
    const createdAt = input.createdAt ?? now;
    const updatedAt = input.updatedAt ?? createdAt;

    await this.context.db
      .insertInto("feishu_apps")
      .values({
        id,
        name: input.name,
        app_id: input.appId,
        app_secret: input.appSecret,
        created_at: createdAt,
        updated_at: updatedAt,
      })
      .execute();

    return requireFeishuApp(await this.get(id));
  }

  async update(id: string, input: UpdateFeishuAppInput): Promise<FeishuApp> {
    const current = requireFeishuApp(await this.get(id));

    await this.context.db
      .updateTable("feishu_apps")
      .set({
        name: input.name ?? current.name,
        app_id: input.appId ?? current.appId,
        app_secret: input.appSecret ?? current.appSecret,
        updated_at: input.updatedAt ?? this.context.now(),
      })
      .where("id", "=", id)
      .execute();

    return requireFeishuApp(await this.get(id));
  }

  async delete(id: string): Promise<void> {
    requireFeishuApp(await this.get(id));

    await this.context.db.deleteFrom("feishu_apps").where("id", "=", id).execute();
  }
}
