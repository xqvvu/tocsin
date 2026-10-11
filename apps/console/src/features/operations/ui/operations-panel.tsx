import { RiPlayLine, RiTimeLine } from "@remixicon/react";

import type { DestinationSummary, SourceSummary } from "@tocsin/core";

import { ContentPanel } from "#/components/common/content-panel";
import { Button } from "#/components/ui/button";
import { DeliveriesTable } from "#/features/deliveries/ui/deliveries-table";
import { EventsTable } from "#/features/events/ui/events-table";
import type { DashboardOperationSearch } from "#/features/operations/model/operation-search";
import type {
  DeliveryDetail,
  EventDetail,
  Operations,
} from "#/features/operations/model/operation-types";
import { DetailPanel } from "#/features/operations/ui/detail-panel";
import { OperationFilters } from "#/features/operations/ui/operation-filters";
import { useTranslations } from "#/i18n/use-i18n";

export interface OperationsPanelProps {
  configuration: {
    sources: SourceSummary[];
    destinations: DestinationSummary[];
  };
  operations: Operations;
  search: DashboardOperationSearch;
  eventDetail: EventDetail | null;
  deliveryDetail: DeliveryDetail | null;
  pending: boolean;
  onRunWorker: () => void;
  onFilterChange: (next: Partial<DashboardOperationSearch>) => void;
  onInspectEvent: (eventId: string) => void;
  onInspectDelivery: (deliveryId: string) => void;
  onRetryDelivery: (deliveryId: string) => void;
  onEventPageChange: (page: number) => void;
  onOlderDeliveries: (cursor: string) => void;
  onLatestDeliveries: () => void;
}

export function OperationsPanel({
  configuration,
  operations,
  search,
  eventDetail,
  deliveryDetail,
  pending,
  onRunWorker,
  onFilterChange,
  onInspectEvent,
  onInspectDelivery,
  onRetryDelivery,
  onEventPageChange,
  onOlderDeliveries,
  onLatestDeliveries,
}: OperationsPanelProps) {
  const t = useTranslations();

  return (
    <ContentPanel
      title={t("operations.title")}
      icon={<RiTimeLine className="size-4" aria-hidden />}
      action={
        <Button variant="outline" size="sm" disabled={pending} onClick={onRunWorker}>
          <RiPlayLine aria-hidden />
          {t("common.actions.runWorker")}
        </Button>
      }
    >
      <OperationFilters
        configuration={configuration}
        search={search}
        pending={pending}
        onChange={onFilterChange}
      />
      <div className="mt-3 grid gap-4 xl:grid-cols-2">
        <EventsTable
          events={operations.events.items}
          page={operations.events.page}
          pageSize={operations.events.pageSize}
          total={operations.events.total}
          pending={pending}
          onInspect={onInspectEvent}
          onPageChange={onEventPageChange}
        />
        <DeliveriesTable
          deliveries={operations.deliveries.items}
          nextCursor={operations.deliveries.nextCursor}
          pending={pending}
          onInspect={onInspectDelivery}
          onRetry={onRetryDelivery}
          onOlder={onOlderDeliveries}
          onLatest={onLatestDeliveries}
        />
      </div>
      <DetailPanel eventDetail={eventDetail} deliveryDetail={deliveryDetail} />
    </ContentPanel>
  );
}
