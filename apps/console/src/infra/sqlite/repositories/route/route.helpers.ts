import { decodeSchemaJson, RouteDefinitionSchema, RouteRuleSchema } from "@tocsin/core";
import type { RouteDefinition } from "@tocsin/core";

import { fromSqliteBoolean } from "#/infra/sqlite/codecs";
import { RecordNotFoundError } from "#/infra/sqlite/errors";
import type { RouteRow } from "#/infra/sqlite/repositories/route/route.interface";

export function routeFromRow(row: RouteRow): RouteDefinition {
  return RouteDefinitionSchema.parse({
    id: row.id,
    name: row.name,
    enabled: fromSqliteBoolean(row.enabled),
    rule: decodeSchemaJson(RouteRuleSchema, row.rule_json),
    destinationIds: decodeDestinationIds(row.destination_ids_json),
  });
}

export function encodeDestinationIds(destinationIds: string[]): string {
  return JSON.stringify(destinationIds);
}

export function decodeDestinationIds(value: string): string[] {
  return RouteDefinitionSchema.shape.destinationIds.parse(JSON.parse(value));
}

export function requireRoute(route: RouteDefinition | null): RouteDefinition {
  if (!route) {
    throw new RecordNotFoundError("Route");
  }

  return route;
}
