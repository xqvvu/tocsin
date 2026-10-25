import { useSuspenseQueries, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { toast } from "sonner";

import { appSettingsQueryOptions } from "#/features/configuration/api/configuration.queries";
import { DeliveriesPageToolbar } from "#/features/deliveries/ui/deliveries-page-toolbar";
import { DeliveriesPausedNotice } from "#/features/deliveries/ui/deliveries-paused-notice";
import { DeliveriesTable } from "#/features/deliveries/ui/deliveries-table";
import {
  destinationCatalogQueryOptions,
  destinationsQueryOptions,
} from "#/features/destinations/api/destination.queries";
import { destinationIconNamesByKind } from "#/features/destinations/ui/destination-kind-icon";
import { useOperationMutations } from "#/features/operations/api/operation.mutations";
import { operationsQueryOptions } from "#/features/operations/api/operations.queries";
import {
  clearedOperationSearch,
  hasOperationFilters,
  type DashboardOperationSearch,
  type OperationFilterData,
} from "#/features/operations/model/operation-search";
import { OperationFilters } from "#/features/operations/ui/operation-filters";
import { showWorkerRunToast } from "#/features/operations/ui/worker-notice-panel";
import { routesQueryOptions } from "#/features/routes/api/route.queries";
import { sourcesQueryOptions } from "#/features/sources/api/source.queries";
import { useTranslations } from "#/i18n/use-i18n";
import { DashboardContentLayout } from "#/shell/dashboard-layout";

export interface DeliveriesPageProps {
  search: DashboardOperationSearch;
  filters: OperationFilterData;
  onSearchChange: (next: Partial<DashboardOperationSearch>) => void;
}

export function DeliveriesPage({ search, filters, onSearchChange }: DeliveriesPageProps) {
  const t = useTranslations();
  const navigate = useNavigate();
  const [
    { data: sources },
    { data: destinations },
    { data: destinationCatalog },
    { data: routes },
  ] = useSuspenseQueries({
    queries: [
      sourcesQueryOptions(),
      destinationsQueryOptions(),
      destinationCatalogQueryOptions(),
      routesQueryOptions(),
    ],
  });
  const destinationIconNames = React.useMemo(
    () => destinationIconNamesByKind(destinationCatalog),
    [destinationCatalog],
  );
  const { data: operations } = useSuspenseQuery(operationsQueryOptions(filters));
  const { data: settings } = useSuspenseQuery(appSettingsQueryOptions());
  const operationConfiguration = { sources, destinations, routes };
  const hasActiveFilters = hasOperationFilters(search);
  const { invalidateOperations, retryDelivery, runDeliveryWorker } = useOperationMutations();
  const [pendingAction, setPendingAction] = React.useState<string | null>(null);
  const pending = pendingAction !== null;

  async function refreshOperations() {
    await invalidateOperations();
  }

  function resetFilters() {
    onSearchChange(clearedOperationSearch);
  }

  async function submitAction<T>(action: string, fn: () => Promise<T>): Promise<T | null> {
    setPendingAction(action);

    try {
      const result = await fn();
      await refreshOperations();
      return result;
    } catch (error) {
      toast.error(t("deliveries.page.operationFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
      return null;
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <DashboardContentLayout
      main={
        <>
          <DeliveriesPausedNotice />
          <DeliveriesPageToolbar
            pending={pending}
            paused={settings.deliveryPaused}
            onRunWorker={() =>
              void submitAction("run-worker", async () => {
                const result = await runDeliveryWorker({
                  limit: 10,
                });
                showWorkerRunToast(result, t);
                return result;
              })
            }
            onResetFilters={resetFilters}
          />
          <OperationFilters
            configuration={operationConfiguration}
            scope="deliveries"
            search={search}
            pending={pending}
            onChange={onSearchChange}
            layout="toolbar"
          />
          <DeliveriesTable
            deliveries={operations.deliveries.items}
            destinationIconNames={destinationIconNames}
            pending={pending}
            hasActiveFilters={hasActiveFilters}
            onResetFilters={resetFilters}
            onInspect={(deliveryId) =>
              void navigate({
                to: "/deliveries/$deliveryId",
                params: {
                  deliveryId,
                },
              })
            }
            onRetry={(deliveryId) =>
              void submitAction(`retry-delivery-${deliveryId}`, () =>
                retryDelivery({
                  id: deliveryId,
                }),
              )
            }
            page={operations.deliveries.page}
            pageSize={operations.deliveries.pageSize}
            total={operations.deliveries.total}
            timeField={search.timeField === "updated" ? "updated" : "created"}
            onPageChange={(page) => onSearchChange({ deliveryPage: page })}
          />
        </>
      }
    />
  );
}
