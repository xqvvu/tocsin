import { oc } from "@orpc/contract";
import { openapi } from "@orpc/openapi";

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
 * missing session so it can redirect. A null session is an expected result, not
 * an error, so neither procedure declares auth error keys.
 */
export const session = {
  getDashboardSession: oc.meta(openapi({ method: "GET" })).output(DashboardSessionOutputSchema),

  getAuthBootstrap: oc.meta(openapi({ method: "GET" })).output(AuthBootstrapOutputSchema),
};
