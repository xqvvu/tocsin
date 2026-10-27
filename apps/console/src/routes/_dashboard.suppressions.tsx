import { createFileRoute } from "@tanstack/react-router";

import { destinationsQueryOptions } from "#/features/destinations/api/destination.queries";
import { sourcesQueryOptions } from "#/features/sources/api/source.queries";
import { suppressionsQueryOptions } from "#/features/suppressions/api/suppression.queries";
import {
  mergeSuppressionSearch,
  SuppressionListSearchSchema,
} from "#/features/suppressions/model/suppression-search";
import { SuppressionsPage } from "#/features/suppressions/ui/suppressions-page";
import { DashboardContentLayout } from "#/shell/dashboard-layout";

export const Route = createFileRoute("/_dashboard/suppressions")({
  validateSearch: (search) => SuppressionListSearchSchema.parse(search),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(suppressionsQueryOptions()),
      context.queryClient.ensureQueryData(sourcesQueryOptions()),
      context.queryClient.ensureQueryData(destinationsQueryOptions()),
    ]),
  component: SuppressionsRoute,
  pendingComponent: DashboardContentLayout.Skeleton,
  pendingMs: 120,
  pendingMinMs: 250,
});

function SuppressionsRoute() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();

  return (
    <SuppressionsPage
      search={search}
      onSearchChange={(next) => {
        void navigate({ search: mergeSuppressionSearch(search, next) as never });
      }}
    />
  );
}
