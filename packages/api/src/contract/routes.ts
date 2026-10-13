import { oc } from "@orpc/contract";
import {
  CreateRouteCommandSchema,
  DeleteRouteCommandSchema,
  UpdateRouteCommandSchema,
} from "@tocsin/core";

import { dashboardAuth } from "../errors/dashboard-auth";
import { resourceErrors } from "../errors/resources";
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

  delete: oc
    .input(DeleteRouteCommandSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(RouteDeleteOutputSchema),
};
