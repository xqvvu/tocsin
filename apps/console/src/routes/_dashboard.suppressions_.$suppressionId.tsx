import { createFileRoute } from "@tanstack/react-router";

import {
  suppressionHitsQueryOptions,
  suppressionQueryOptions,
} from "#/features/suppressions/api/suppression.queries";
import { SuppressionDetailPage } from "#/features/suppressions/ui/suppression-detail-page";
import { DashboardContentLayout } from "#/shell/dashboard-layout";

export const Route = createFileRoute("/_dashboard/suppressions_/$suppressionId")({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(suppressionQueryOptions(params.suppressionId)),
      context.queryClient.ensureQueryData(suppressionHitsQueryOptions(params.suppressionId)),
    ]),
  component: SuppressionDetailRoute,
  pendingComponent: DashboardContentLayout.DetailSkeleton,
  pendingMs: 120,
  pendingMinMs: 250,
});

function SuppressionDetailRoute() {
  const { suppressionId } = Route.useParams();

  return <SuppressionDetailPage suppressionId={suppressionId} />;
}
