import { RiRefreshLine } from "@remixicon/react";
import { useSuspenseQueries } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";

import type { DestinationSummary, RouteDefinition, SourceSummary } from "@tocsin/core";

import { PageToolbar } from "#/components/common/page-toolbar";
import { Button } from "#/components/ui/button";
import { destinationsQueryOptions } from "#/features/destinations/api/destination.queries";
import { useRouteMutations } from "#/features/routes/api/route.mutations";
import { routesQueryOptions } from "#/features/routes/api/route.queries";
import { RouteAddDialog } from "#/features/routes/ui/route-add-dialog";
import { RouteReplayPrompt } from "#/features/routes/ui/route-replay-prompt";
import { RoutesSection } from "#/features/routes/ui/routes-section";
import { sourcesQueryOptions } from "#/features/sources/api/source.queries";
import { useTranslations } from "#/i18n/use-i18n";
import { DashboardContentLayout } from "#/shell/dashboard-layout";

export function RoutesPage() {
  const t = useTranslations();
  const [{ data: routes }, { data: sources }, { data: destinations }] = useSuspenseQueries({
    queries: [routesQueryOptions(), sourcesQueryOptions(), destinationsQueryOptions()],
  });
  const { createRoute, deleteRoute, invalidateRoutes, updateRoute } = useRouteMutations();
  const [editingRouteId, setEditingRouteId] = React.useState<string | null>(null);
  const [replayRouteId, setReplayRouteId] = React.useState<string | null>(null);
  const [pendingAction, setPendingAction] = React.useState<string | null>(null);
  const editingRoute = editingRouteId
    ? (routes.find((route) => route.id === editingRouteId) ?? null)
    : null;
  const pending = pendingAction !== null;

  async function refreshConfiguration(): Promise<boolean> {
    try {
      await invalidateRoutes();
      return true;
    } catch (error) {
      toast.error(t("routing.page.operationFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async function submitAction<T>(action: string, fn: () => Promise<T>): Promise<T | null> {
    setPendingAction(action);

    try {
      const result = await fn();
      await refreshConfiguration();
      return result;
    } catch (error) {
      toast.error(t("routing.page.operationFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
      return null;
    } finally {
      setPendingAction(null);
    }
  }

  function maybeOpenRouteReplay(route: RouteDefinition | null): void {
    if (route?.enabled) {
      setReplayRouteId(route.id);
    }
  }

  return (
    <DashboardContentLayout
      main={
        <>
          <RoutesPageToolbar
            pending={pending}
            sources={sources}
            destinations={destinations}
            onCreate={(input) =>
              void submitAction("create-route", () => createRoute(input)).then(maybeOpenRouteReplay)
            }
            onRefresh={() => void refreshConfiguration()}
          />
          <RoutesSection
            routes={routes}
            sources={sources}
            destinations={destinations}
            editingRoute={editingRoute}
            pending={pending}
            onEdit={setEditingRouteId}
            onCancelEdit={() => setEditingRouteId(null)}
            onPreviewReplay={(route) => setReplayRouteId(route.id)}
            onToggle={(route) =>
              void submitAction(`toggle-route-${route.id}`, () =>
                updateRoute({
                  id: route.id,
                  enabled: !route.enabled,
                }),
              ).then(maybeOpenRouteReplay)
            }
            onDelete={(route) =>
              void submitAction(`delete-route-${route.id}`, () =>
                deleteRoute({
                  id: route.id,
                }),
              )
            }
            onSubmitEdit={(input) =>
              void submitAction(`edit-route-${input.id}`, async () => {
                const result = await updateRoute(input);
                setEditingRouteId(null);
                return result;
              }).then(maybeOpenRouteReplay)
            }
          />
          <RouteReplayPrompt routeId={replayRouteId} onClose={() => setReplayRouteId(null)} />
        </>
      }
    />
  );
}

function RoutesPageToolbar({
  pending,
  sources,
  destinations,
  onCreate,
  onRefresh,
}: {
  pending: boolean;
  sources: SourceSummary[];
  destinations: DestinationSummary[];
  onCreate: (input: {
    name: string;
    rule: RouteDefinition["rule"];
    destinationIds: string[];
  }) => void;
  onRefresh: () => void;
}) {
  const t = useTranslations();

  return (
    <PageToolbar
      description={t("routing.page.description")}
      actions={
        <>
          <RouteAddDialog
            sources={sources}
            destinations={destinations}
            pending={pending}
            onSubmit={onCreate}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={onRefresh}
            title={t("routing.page.refreshTitle")}
            className="w-fit"
          >
            <RiRefreshLine data-icon="inline-start" aria-hidden />
            {t("common.actions.refresh")}
          </Button>
        </>
      }
    />
  );
}
