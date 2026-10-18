import { createFileRoute } from "@tanstack/react-router";

import { DeliveriesPage } from "#/features/deliveries/ui/deliveries-page";
import {
  destinationCatalogQueryOptions,
  destinationsQueryOptions,
} from "#/features/destinations/api/destination.queries";
import { operationsQueryOptions } from "#/features/operations/api/operations.queries";
import {
  DashboardOperationSearchSchema,
  mergeOperationSearch,
  operationFiltersFromSearch,
} from "#/features/operations/model/operation-search";
import { routesQueryOptions } from "#/features/routes/api/route.queries";
import { sourcesQueryOptions } from "#/features/sources/api/source.queries";
import { DashboardContentLayout } from "#/shell/dashboard-layout";

export const Route = createFileRoute("/_dashboard/deliveries")({
  validateSearch: (search) => DashboardOperationSearchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps: search }) => {
    const filters = operationFiltersFromSearch(search);

    await Promise.all([
      context.queryClient.ensureQueryData(sourcesQueryOptions()),
      context.queryClient.ensureQueryData(destinationsQueryOptions()),
      context.queryClient.ensureQueryData(destinationCatalogQueryOptions()),
      context.queryClient.ensureQueryData(routesQueryOptions()),
      context.queryClient.ensureQueryData(operationsQueryOptions(filters)),
    ]);

    return { filters };
  },
  component: DeliveriesRoute,
  pendingComponent: DashboardContentLayout.SkeletonWithRail,
  pendingMs: 120,
  pendingMinMs: 250,
});

function DeliveriesRoute() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const { filters } = Route.useLoaderData();

  return (
    <DeliveriesPage
      search={search}
      filters={filters}
      onSearchChange={(next) => {
        void navigate({
          search: mergeOperationSearch(search, next) as never,
        });
      }}
    />
  );
}
