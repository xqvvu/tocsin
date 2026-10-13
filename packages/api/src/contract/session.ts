import { oc } from "@orpc/contract";
import { openapi } from "@orpc/openapi";

import { dashboardAuth } from "../errors/dashboard-auth";
import { AuthBootstrapOutputSchema, DashboardSessionOutputSchema } from "../schemas/auth";

/**
 * Public session procedures.
 *
 * Deliberately NOT named `auth`: better-auth serves the /api/auth/* URL space,
 * and its nested route wins over the RPC splat. A segment named `auth` would
 * therefore be unreachable over HTTP — every browser call would 404 while SSR
 * kept working, because the server calls the router directly instead of going
 * through a URL.
 *
 * Both procedures are reachable without a dashboard session: the login and
 * setup routes need the bootstrap flag, and the dashboard shell tolerates a
 * missing session so it can redirect. So **no session** is a `null` result, not
 * an error.
 *
 * `getDashboardSession` declares `FORBIDDEN`, though, because a session that
 * exists but lacks dashboard access is a different outcome and must not be
 * flattened into `null` — that is what made a signed-in member look
 * indistinguishable from a signed-out visitor.
 */
export const session = {
  getDashboardSession: oc
    .meta(openapi({ method: "GET" }))
    .errors(dashboardAuth.error)
    .output(DashboardSessionOutputSchema),

  getAuthBootstrap: oc.meta(openapi({ method: "GET" })).output(AuthBootstrapOutputSchema),
};
