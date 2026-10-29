import { createFileRoute } from "@tanstack/react-router";

import {
  destinationCatalogQueryOptions,
  destinationsQueryOptions,
} from "#/features/destinations/api/destination.queries";
import { DestinationsPage } from "#/features/destinations/ui/destinations-page";
import { routesQueryOptions } from "#/features/routes/api/route.queries";
import { sourcesQueryOptions } from "#/features/sources/api/source.queries";
import { DashboardContentLayout } from "#/shell/dashboard-layout";

export const Route = createFileRoute("/_dashboard/destinations")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(destinationsQueryOptions()),
      context.queryClient.ensureQueryData(routesQueryOptions()),
      context.queryClient.ensureQueryData(sourcesQueryOptions()),
      context.queryClient.ensureQueryData(destinationCatalogQueryOptions()),
    ]),
  component: DestinationsPage,
  pendingComponent: DashboardContentLayout.Skeleton,
  pendingMs: 120,
  pendingMinMs: 250,
});
