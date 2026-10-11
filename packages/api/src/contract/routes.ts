import { oc } from "@orpc/contract";
import { openapi } from "@orpc/openapi";
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
  list: oc
    .meta(openapi({ method: "GET" }))
    .errors(dashboardErrors)
    .output(RouteListOutputSchema),

  create: oc
    .meta(openapi({ method: "POST" }))
    .input(CreateRouteCommandSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(RouteOutputSchema),

  update: oc
    .meta(openapi({ method: "POST" }))
    .input(UpdateRouteCommandSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(RouteOutputSchema),

  delete: oc
    .meta(openapi({ method: "POST" }))
    .input(DeleteRouteCommandSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(RouteDeleteOutputSchema),
};
