import { useSuspenseQueries, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { toast } from "sonner";

import { destinationsQueryOptions } from "#/features/destinations/api/destination.queries";
import { EventsPageToolbar } from "#/features/events/ui/events-page-toolbar";
import { EventsTable } from "#/features/events/ui/events-table";
import { useOperationMutations } from "#/features/operations/api/operation.mutations";
import { operationsQueryOptions } from "#/features/operations/api/operations.queries";
import type {
  DashboardOperationSearch,
  OperationFilterData,
} from "#/features/operations/model/operation-search";
import { OperationFilters } from "#/features/operations/ui/operation-filters";
import { sourcesQueryOptions } from "#/features/sources/api/source.queries";
import { useTranslations } from "#/i18n/use-i18n";
import { DashboardContentLayout } from "#/shell/dashboard-layout";

export interface EventsPageProps {
  search: DashboardOperationSearch;
  filters: OperationFilterData;
  onSearchChange: (next: Partial<DashboardOperationSearch>) => void;
}

export function EventsPage({ search, filters, onSearchChange }: EventsPageProps) {
  const t = useTranslations();
  const navigate = useNavigate();
  const [{ data: sources }, { data: destinations }] = useSuspenseQueries({
    queries: [sourcesQueryOptions(), destinationsQueryOptions()],
  });
  const { data: operations } = useSuspenseQuery(operationsQueryOptions(filters));
  const operationConfiguration = { sources, destinations };
  const { invalidateOperations } = useOperationMutations();
  const [pendingAction, setPendingAction] = React.useState<string | null>(null);
  const pending = pendingAction !== null;

  async function refreshOperations() {
    setPendingAction("refresh-events");

    try {
      await invalidateOperations();
    } catch (error) {
      toast.error(t("events.page.operationFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPendingAction(null);
    }
  }

  function resetFilters() {
    onSearchChange({
      sourceId: "",
      severity: "",
      status: "",
      destinationId: "",
      routeId: "",
      deliveryState: "",
      range: "",
      q: "",
    });
  }

  return (
    <DashboardContentLayout
      main={
        <>
          <EventsPageToolbar
            pending={pending}
            onRefresh={() => void refreshOperations()}
            onResetFilters={resetFilters}
          />
          <OperationFilters
            configuration={operationConfiguration}
            scope="events"
            search={search}
            pending={pending}
            onChange={onSearchChange}
            layout="toolbar"
          />
          <EventsTable
            events={operations.events.items}
            page={operations.events.page}
            pageSize={operations.events.pageSize}
            total={operations.events.total}
            pending={pending}
            onInspect={(eventId) =>
              void navigate({
                to: "/events/$eventId",
                params: {
                  eventId,
                },
              })
            }
            onPageChange={(eventPage) => onSearchChange({ eventPage })}
          />
        </>
      }
    />
  );
}
