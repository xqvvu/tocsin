import { createFileRoute } from "@tanstack/react-router";

import {
  appSettingsQueryOptions,
  runtimeInformationQueryOptions,
} from "#/features/configuration/api/configuration.queries";
import { SettingsPage } from "#/features/configuration/ui/settings-page";
import { destinationsQueryOptions } from "#/features/destinations/api/destination.queries";
import { routesQueryOptions } from "#/features/routes/api/route.queries";
import { sourcesQueryOptions } from "#/features/sources/api/source.queries";
import { DashboardContentLayout } from "#/shell/dashboard-layout";

export const Route = createFileRoute("/_dashboard/settings")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(appSettingsQueryOptions()),
      context.queryClient.ensureQueryData(runtimeInformationQueryOptions()),
      context.queryClient.ensureQueryData(sourcesQueryOptions()),
      context.queryClient.ensureQueryData(destinationsQueryOptions()),
      context.queryClient.ensureQueryData(routesQueryOptions()),
    ]),
  component: SettingsPage,
  pendingComponent: DashboardContentLayout.SettingsSkeleton,
  pendingMs: 120,
  pendingMinMs: 250,
});
