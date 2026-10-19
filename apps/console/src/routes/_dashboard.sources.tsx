import { createFileRoute } from "@tanstack/react-router";

import { destinationsQueryOptions } from "#/features/destinations/api/destination.queries";
import { routesQueryOptions } from "#/features/routes/api/route.queries";
import { sourcesQueryOptions } from "#/features/sources/api/source.queries";
import { SourcesPage } from "#/features/sources/ui/sources-page";
import { DashboardContentLayout } from "#/shell/dashboard-layout";

export const Route = createFileRoute("/_dashboard/sources")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(sourcesQueryOptions()),
      context.queryClient.ensureQueryData(routesQueryOptions()),
      context.queryClient.ensureQueryData(destinationsQueryOptions()),
    ]),
  component: SourcesPage,
  pendingComponent: DashboardContentLayout.Skeleton,
  pendingMs: 120,
  pendingMinMs: 250,
});
