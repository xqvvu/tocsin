import { createFileRoute } from "@tanstack/react-router";

import { destinationsQueryOptions } from "#/features/destinations/api/destination.queries";
import { sourcesQueryOptions } from "#/features/sources/api/source.queries";
import { suppressionsQueryOptions } from "#/features/suppressions/api/suppression.queries";
import { SuppressionsPage } from "#/features/suppressions/ui/suppressions-page";
import { DashboardContentLayout } from "#/shell/dashboard-layout";

export const Route = createFileRoute("/_dashboard/suppressions")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(suppressionsQueryOptions()),
      context.queryClient.ensureQueryData(sourcesQueryOptions()),
      context.queryClient.ensureQueryData(destinationsQueryOptions()),
    ]),
  component: SuppressionsPage,
  pendingComponent: DashboardContentLayout.Skeleton,
  pendingMs: 120,
  pendingMinMs: 250,
});
