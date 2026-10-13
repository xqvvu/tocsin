import { findDashboardContext } from "#/server/orpc/middlewares/dashboard-context";
import { os } from "#/server/orpc/os";
import { getApplicationContainer } from "#/server/runtime/container";
import { toDashboardSessionPayload } from "#/server/runtime/dashboard-session";

/**
 * Public session procedures.
 *
 * `getDashboardSession` stays tolerant about *absence*: the dashboard shell asks
 * for the session before it knows whether one exists, so no session is `null`
 * rather than an error the client would have to catch.
 *
 * It is not tolerant about *authorisation*. `findDashboardContext` folds only
 * `UNAUTHORIZED` into `null` and lets `FORBIDDEN` propagate, so a signed-in user
 * without dashboard access gets an explicit error instead of being told —
 * silently — that they have no session. The shell relies on that distinction to
 * tell "sign in" apart from "you cannot use this".
 *
 * The payload comes from `toDashboardSessionPayload`, which is defined by
 * naming the identity fields it exposes. Better Auth's session also carries
 * `session.token`; building the response by copying from the session would ship
 * that to the browser, so the projection is by omission instead.
 */
export const sessionRouter = os.session.router({
  getDashboardSession: os.session.getDashboardSession.handler(async ({ context }) => {
    const dashboardRequest = await findDashboardContext({ reqHeaders: context.reqHeaders });

    if (!dashboardRequest) {
      return null;
    }

    return toDashboardSessionPayload(dashboardRequest.dashboardSession);
  }),

  getAuthBootstrap: os.session.getAuthBootstrap.handler(async () => {
    return {
      setupRequired: !(await getApplicationContainer().hasRegisteredUsers()),
    };
  }),
});
