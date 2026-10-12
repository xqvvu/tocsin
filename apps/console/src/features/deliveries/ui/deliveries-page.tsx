import { useSuspenseQueries, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { toast } from "sonner";

import { DeliveriesPageToolbar } from "#/features/deliveries/ui/deliveries-page-toolbar";
import { DeliveriesTable } from "#/features/deliveries/ui/deliveries-table";
import {
  destinationCatalogQueryOptions,
  destinationsQueryOptions,
} from "#/features/destinations/api/destination.queries";
import { destinationIconNamesByKind } from "#/features/destinations/ui/destination-kind-icon";
import { useOperationMutations } from "#/features/operations/api/operation.mutations";
import { operationsQueryOptions } from "#/features/operations/api/operations.queries";
import {
  decodeCursorTrail,
  encodeCursorTrail,
  type DashboardOperationSearch,
  type OperationFilterData,
} from "#/features/operations/model/operation-search";
import { OperationFilters } from "#/features/operations/ui/operation-filters";
import { showWorkerRunToast } from "#/features/operations/ui/worker-notice-panel";
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
  const [{ data: sources }, { data: destinations }, { data: destinationCatalog }] =
    useSuspenseQueries({
      queries: [
        sourcesQueryOptions(),
        destinationsQueryOptions(),
        destinationCatalogQueryOptions(),
      ],
    });
  const destinationIconNames = React.useMemo(
    () => destinationIconNamesByKind(destinationCatalog),
    [destinationCatalog],
  );
  const { data: operations } = useSuspenseQuery(operationsQueryOptions(filters));
  const operationConfiguration = { sources, destinations };
  const { invalidateOperations, retryDelivery, runDeliveryWorker } = useOperationMutations();
  const [pendingAction, setPendingAction] = React.useState<string | null>(null);
  const pending = pendingAction !== null;

  // Cursor paging cannot derive its own history, so the visited cursors live in
  // the URL (see `deliveryCursorTrail`) and are replayed here: appending one to
  // go deeper, popping one to come back.
  // The trail ends with the page being shown; its head is always page 1, which
  // has no cursor of its own.
  const cursorTrail = decodeCursorTrail(search.deliveryCursorTrail);
  const canPrevious = cursorTrail.length > 1;

  async function refreshOperations() {
    await invalidateOperations();
  }

  function resetFilters() {
    onSearchChange({
      sourceId: "",
      severity: "",
      status: "",
      destinationId: "",
      deliveryState: "",
      q: "",
    });
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
          <DeliveriesPageToolbar
            pending={pending}
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
            search={search}
            pending={pending}
            onChange={onSearchChange}
            layout="toolbar"
          />
          <DeliveriesTable
            deliveries={operations.deliveries.items}
            destinationIconNames={destinationIconNames}
            nextCursor={operations.deliveries.nextCursor}
            pending={pending}
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
            canPrevious={canPrevious}
            // Going forward pushes the page we are leaving onto the trail, so
            // Previous can come back to it.
            onOlder={(cursor) =>
              onSearchChange({
                deliveryCursor: cursor,
                deliveryCursorTrail: encodeCursorTrail([...cursorTrail, cursor]),
              })
            }
            onPrevious={() => {
              const remaining = cursorTrail.slice(0, -1);
              // The cursor we are returning to is the one the previous page was
              // fetched with — i.e. the last entry still on the trail. Page 1
              // has no cursor, so an empty trail means "back to the start".
              onSearchChange({
                deliveryCursor: remaining.at(-1) ?? "",
                deliveryCursorTrail: encodeCursorTrail(remaining),
              });
            }}
          />
        </>
      }
    />
  );
}
