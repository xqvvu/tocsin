import { orpc } from "#/lib/orpc";

export const authQueryKeys = {
  all: ["auth"] as const,
  dashboardSession: () => [...authQueryKeys.all, "dashboard-session"] as const,
  bootstrap: () => [...authQueryKeys.all, "bootstrap"] as const,
};

/**
 * Why the session probe can fail with `FORBIDDEN` rather than `null`.
 *
 * The probe returns `null` when there is no session, and throws `FORBIDDEN` when
 * a session exists but cannot use the dashboard. Callers need to tell those
 * apart — one means "sign in", the other means "signing in will not help" — so
 * the error is not flattened here.
 *
 * `retry: false` because neither outcome changes without the user acting; the
 * default retry would just delay the redirect by a few seconds.
 */
export function dashboardSessionQueryOptions() {
  return orpc.session.getDashboardSession.queryOptions({
    queryKey: authQueryKeys.dashboardSession(),
    retry: false,
  });
}

/** True when the failure is "signed in, but not allowed" rather than "no session". */
export function isForbiddenSessionError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "FORBIDDEN"
  );
}

export function authBootstrapQueryOptions() {
  return orpc.session.getAuthBootstrap.queryOptions({
    queryKey: authQueryKeys.bootstrap(),
  });
}
