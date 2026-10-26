import { oc } from "@orpc/contract";
import {
  CreateRouteCommandSchema,
  DeleteRouteCommandSchema,
  UpdateRouteCommandSchema,
} from "@tocsin/core";

import { dashboardAuth } from "../errors/dashboard-auth";
import { resourceErrors } from "../errors/resources";
import { DeletionImpactOutputSchema } from "../schemas/deletion-impact";
import {
  RouteDeleteOutputSchema,
  RouteListOutputSchema,
  RouteOutputSchema,
} from "../schemas/routes";

const dashboardErrors = dashboardAuth.error;

/**
 * Route rule administration.
 *
 * Writes declare `NOT_FOUND` and `BAD_REQUEST`: the repository raises
 * `RecordNotFoundError` for a missing route, and the service rejects rules that
 * reference unknown source or destination ids.
 */
export const routes = {
  list: oc.errors(dashboardErrors).output(RouteListOutputSchema),

  create: oc
    .input(CreateRouteCommandSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(RouteOutputSchema),

  update: oc
    .input(UpdateRouteCommandSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(RouteOutputSchema),

  // Read-only disclosure of the fan-out a route delete cascades to; events
  // survive, so only deliveries, attempts, and urgent pings are counted.
  previewDelete: oc
    .input(DeleteRouteCommandSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(DeletionImpactOutputSchema),

  delete: oc
    .input(DeleteRouteCommandSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(RouteDeleteOutputSchema),
};
