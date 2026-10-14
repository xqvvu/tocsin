import { createFileRoute } from "@tanstack/react-router";

import { destinationsQueryOptions } from "#/features/destinations/api/destination.queries";
import { EventsPage } from "#/features/events/ui/events-page";
import { operationsQueryOptions } from "#/features/operations/api/operations.queries";
import {
  DashboardOperationSearchSchema,
  mergeOperationSearch,
  operationFiltersFromSearch,
} from "#/features/operations/model/operation-search";
import { sourcesQueryOptions } from "#/features/sources/api/source.queries";
import { DashboardContentLayout } from "#/shell/dashboard-layout";

export const Route = createFileRoute("/_dashboard/events")({
  validateSearch: (search) => DashboardOperationSearchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps: search }) => {
    const filters = operationFiltersFromSearch(search);

    await Promise.all([
      context.queryClient.ensureQueryData(sourcesQueryOptions()),
      context.queryClient.ensureQueryData(destinationsQueryOptions()),
      context.queryClient.ensureQueryData(operationsQueryOptions(filters)),
    ]);

    return { filters };
  },
  component: EventsRoute,
  pendingComponent: DashboardContentLayout.Skeleton,
  pendingMs: 120,
  pendingMinMs: 250,
});

function EventsRoute() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const { filters } = Route.useLoaderData();

  return (
    <EventsPage
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
