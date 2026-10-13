import { useQueryClient, useSuspenseQuery, type QueryClient } from "@tanstack/react-query";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import {
  dashboardSessionQueryOptions,
  isForbiddenSessionError,
} from "#/features/auth/api/auth.queries";
import { DashboardErrorPage } from "#/shell/dashboard-error";
import { DashboardForbiddenPage } from "#/shell/dashboard-forbidden";
import { DashboardLayout } from "#/shell/dashboard-layout";
import { DashboardNotFoundPage } from "#/shell/dashboard-not-found";

function ensureDashboardSession(queryClient: QueryClient) {
  return queryClient.ensureQueryData(dashboardSessionQueryOptions());
}

export const Route = createFileRoute("/_dashboard")({
  loader: async ({ context, location }) => {
    let session: Awaited<ReturnType<typeof ensureDashboardSession>>;

    try {
      session = await ensureDashboardSession(context.queryClient);
    } catch (error) {
      // A session that lacks dashboard access must NOT become a login redirect:
      // signing in again lands right back here. Report it instead, and let the
      // component render that state.
      if (isForbiddenSessionError(error)) {
        return { forbidden: true as const };
      }

      throw error;
    }

    // No session at all: send them to sign in. Kept outside the `try` so this
    // control-flow value can never be mistaken for a caught error.
    if (!session) {
      throw redirect({
        to: "/login" as const,
        search: {
          redirect: location.href,
        } as never,
      });
    }

    return { forbidden: false as const };
  },
  component: DashboardRouteLayout,
  errorComponent: DashboardRouteError,
  notFoundComponent: DashboardNotFoundPage,
  pendingComponent: DashboardLayout.Skeleton,
  pendingMs: 120,
  pendingMinMs: 250,
});

function DashboardRouteLayout() {
  const { forbidden } = Route.useLoaderData();

  if (forbidden) {
    // Rendered instead of a redirect: the session is real, it just cannot use
    // the dashboard.
    return <DashboardForbiddenPage />;
  }

  return <DashboardRouteContent />;
}

function DashboardRouteContent() {
  const { data: session } = useSuspenseQuery(dashboardSessionQueryOptions());

  if (!session) {
    return null;
  }

  return (
    <DashboardLayout user={session.user}>
      <Outlet />
    </DashboardLayout>
  );
}

function DashboardRouteError(props: ErrorComponentProps) {
  const queryClient = useQueryClient();
  const session = queryClient.getQueryData(dashboardSessionQueryOptions().queryKey);

  if (!session) {
    return <DashboardErrorPage {...props} />;
  }

  return (
    <DashboardLayout user={session.user}>
      <DashboardErrorPage {...props} />
    </DashboardLayout>
  );
}
