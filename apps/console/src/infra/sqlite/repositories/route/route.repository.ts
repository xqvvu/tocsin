import { encodeSchemaJson, RouteDefinitionSchema, RouteRuleSchema } from "@tocsin/core";
import type { RouteDefinition } from "@tocsin/core";

import { toSqliteBoolean } from "#/infra/sqlite/codecs";
import type { SqliteRepositoryContext } from "#/infra/sqlite/context";
import {
  encodeDestinationIds,
  requireRoute,
  routeFromRow,
} from "#/infra/sqlite/repositories/route/route.helpers";
import type {
  CreateRouteInput,
  RouteReferenceCleanupResult,
  RouteRepository,
  UpdateRouteInput,
} from "#/infra/sqlite/repositories/route/route.interface";

export class SqliteRouteRepository implements RouteRepository {
  constructor(private readonly context: SqliteRepositoryContext) {}

  async list(): Promise<RouteDefinition[]> {
    const rows = await this.context.db
      .selectFrom("routes")
      .selectAll()
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .execute();

    return rows.map((row) => routeFromRow(row));
  }

  async listEnabled(): Promise<RouteDefinition[]> {
    const rows = await this.context.db
      .selectFrom("routes")
      .selectAll()
      .where("enabled", "=", 1)
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .execute();

    return rows.map((row) => routeFromRow(row));
  }

  async get(id: string): Promise<RouteDefinition | null> {
    const row = await this.context.db
      .selectFrom("routes")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? routeFromRow(row) : null;
  }

  async create(input: CreateRouteInput): Promise<RouteDefinition> {
    const now = this.context.now();
    const createdAt = input.createdAt ?? now;
    const route = RouteDefinitionSchema.parse({
      id: input.id ?? this.context.ids.route(),
      name: input.name,
      enabled: input.enabled ?? true,
      rule: input.rule,
      destinationIds: input.destinationIds,
    });
    const updatedAt = input.updatedAt ?? createdAt;

    await this.context.db
      .insertInto("routes")
      .values({
        id: route.id,
        name: route.name,
        enabled: toSqliteBoolean(route.enabled),
        rule_json: encodeSchemaJson(RouteRuleSchema, route.rule),
        destination_ids_json: encodeDestinationIds(route.destinationIds),
        created_at: createdAt,
        updated_at: updatedAt,
      })
      .execute();

    return requireRoute(await this.get(route.id));
  }

  async update(id: string, input: UpdateRouteInput): Promise<RouteDefinition> {
    const current = requireRoute(await this.get(id));
    const route = RouteDefinitionSchema.parse({
      id,
      name: input.name ?? current.name,
      enabled: input.enabled ?? current.enabled,
      rule: input.rule ?? current.rule,
      destinationIds: input.destinationIds ?? current.destinationIds,
    });

    await this.context.db
      .updateTable("routes")
      .set({
        name: route.name,
        enabled: toSqliteBoolean(route.enabled),
        rule_json: encodeSchemaJson(RouteRuleSchema, route.rule),
        destination_ids_json: encodeDestinationIds(route.destinationIds),
        updated_at: input.updatedAt ?? this.context.now(),
      })
      .where("id", "=", id)
      .execute();

    return requireRoute(await this.get(id));
  }

  setEnabled(id: string, enabled: boolean): Promise<RouteDefinition> {
    return this.update(id, { enabled });
  }

  async removeSourceReference(sourceId: string): Promise<RouteReferenceCleanupResult> {
    const routes = await this.list();
    let updated = 0;
    let deleted = 0;

    for (const route of routes) {
      if (!route.rule.sourceIds.includes(sourceId)) {
        continue;
      }

      const sourceIds = route.rule.sourceIds.filter((id) => id !== sourceId);

      if (sourceIds.length === 0) {
        await this.delete(route.id);
        deleted += 1;
        continue;
      }

      await this.update(route.id, {
        rule: {
          ...route.rule,
          sourceIds,
        },
      });
      updated += 1;
    }

    return { updated, deleted };
  }

  async removeDestinationReference(destinationId: string): Promise<RouteReferenceCleanupResult> {
    const routes = await this.list();
    let updated = 0;
    let deleted = 0;

    for (const route of routes) {
      if (!route.destinationIds.includes(destinationId)) {
        continue;
      }

      const destinationIds = route.destinationIds.filter((id) => id !== destinationId);

      if (destinationIds.length === 0) {
        await this.delete(route.id);
        deleted += 1;
        continue;
      }

      await this.update(route.id, { destinationIds });
      updated += 1;
    }

    return { updated, deleted };
  }

  async delete(id: string): Promise<void> {
    requireRoute(await this.get(id));

    await this.context.db.deleteFrom("routes").where("id", "=", id).execute();
  }
}
