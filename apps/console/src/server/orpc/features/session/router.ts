import { findDashboardContext } from "#/server/orpc/middlewares/dashboard-context";
import { withDashboardService } from "#/server/orpc/middlewares/require-dashboard";
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
const withSessionSecurityService = withDashboardService((container) =>
  container.createSessionSecurityService(),
);

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

  // The account is taken from the verified session, never from the input, so
  // these procedures cannot be pointed at another account.
  listActiveSessions: os.session.listActiveSessions
    .use(withSessionSecurityService)
    .handler(({ context }) =>
      context.service.listActiveSessions({
        userId: context.dashboardRequest.dashboardSession.session.userId,
        currentSessionId: context.dashboardRequest.dashboardSession.session.id,
      }),
    ),

  revokeOtherSessions: os.session.revokeOtherSessions
    .use(withSessionSecurityService)
    .handler(({ context }) =>
      context.service.revokeOtherSessions({ headers: context.dashboardRequest.headers }),
    ),
});
