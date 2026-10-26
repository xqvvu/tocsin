import {
  CreateRouteCommandSchema,
  DeleteRouteCommandSchema,
  UpdateRouteCommandSchema,
  type CreateRouteCommand,
  type DeleteRouteCommand,
  type DeletionImpact,
  type RouteDefinition,
  type UpdateRouteCommand,
} from "@tocsin/core";

import { RecordNotFoundError } from "#/infra/sqlite/errors";
import {
  requireExistingDestinationIds,
  requireExistingSourceIds,
} from "#/server/configuration/configuration-support";
import type { RouteServiceOptions } from "#/server/routes/route.service.types";

export class RouteService {
  private readonly store: RouteServiceOptions["store"];

  constructor(options: RouteServiceOptions) {
    this.store = options.store;
  }

  async listRoutes(): Promise<RouteDefinition[]> {
    return this.store.routes.list();
  }

  async createRoute(command: CreateRouteCommand): Promise<RouteDefinition> {
    const input = CreateRouteCommandSchema.parse(command);

    await requireExistingSourceIds(input.rule?.sourceIds ?? [], this.store.sources);
    await requireExistingDestinationIds(input.destinationIds, this.store.destinations);

    return this.store.routes.create({
      name: input.name,
      enabled: input.enabled,
      rule: input.rule,
      destinationIds: input.destinationIds,
    });
  }

  async updateRoute(command: UpdateRouteCommand): Promise<RouteDefinition> {
    const input = UpdateRouteCommandSchema.parse(command);

    if (input.rule) {
      await requireExistingSourceIds(input.rule.sourceIds, this.store.sources);
    }

    if (input.destinationIds) {
      await requireExistingDestinationIds(input.destinationIds, this.store.destinations);
    }

    return this.store.routes.update(input.id, {
      name: input.name,
      enabled: input.enabled,
      rule: input.rule,
      destinationIds: input.destinationIds,
    });
  }

  /**
   * History rows a route delete would cascade to. Events survive a route
   * delete, so its impact only covers the fan-out the route produced.
   */
  async previewDeleteRoute(command: DeleteRouteCommand): Promise<DeletionImpact> {
    const input = DeleteRouteCommandSchema.parse(command);
    const route = await this.store.routes.get(input.id);

    if (!route) {
      throw new RecordNotFoundError("Route", input.id);
    }

    return this.store.history.countDeletionImpact({ routeId: input.id });
  }

  async deleteRoute(command: DeleteRouteCommand): Promise<{ id: string }> {
    const input = DeleteRouteCommandSchema.parse(command);

    await this.store.routes.delete(input.id);

    return { id: input.id };
  }
}
