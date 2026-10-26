import type { ColumnDef } from "@tanstack/react-table";
import * as React from "react";

import { OperationsTable } from "#/components/common/operations-table";
import type { ConsoleTableFeatures } from "#/components/common/table-features";
import { TablePagination } from "#/components/common/table-pagination";
import { EventActions } from "#/features/events/ui/event-actions";
import { EventDeliveryCountsCell } from "#/features/events/ui/event-delivery-counts-cell";
import { EventStateCell } from "#/features/events/ui/event-state-cell";
import { EventTitleCell } from "#/features/events/ui/event-title-cell";
import { EventsEmptyState } from "#/features/events/ui/events-empty-state";
import {
  eventsColumnClassName,
  eventsPageSize,
  eventsTableMinWidthClassName,
} from "#/features/events/ui/events-table-layout";
import type { Operations } from "#/features/operations/model/operation-types";
import { OperationTimestamp } from "#/features/operations/ui/operation-timestamp";
import { useTranslations } from "#/i18n/use-i18n";

export function EventsTable({
  events,
  page,
  pageSize,
  total,
  pending,
  hasActiveFilters,
  onInspect,
  onPageChange,
  onResetFilters,
}: {
  events: Operations["events"]["items"];
  page: number;
  pageSize: number;
  total: number;
  pending: boolean;
  hasActiveFilters: boolean;
  onInspect: (eventId: string) => void;
  onPageChange: (page: number) => void;
  onResetFilters: () => void;
}) {
  const t = useTranslations();
  const data = React.useMemo(() => events, [events]);
  const normalizedPageSize = Math.max(pageSize, 1);
  const pageCount = Math.max(Math.ceil(total / normalizedPageSize), 1);
  const pageIndex = Math.min(Math.max(page - 1, 0), pageCount - 1);
  const columns = React.useMemo<
    Array<ColumnDef<ConsoleTableFeatures, Operations["events"]["items"][number]>>
  >(
    () => [
      {
        id: "event",
        header: t("events.table.headers.event"),
        cell: ({ row }) => (
          <EventTitleCell
            title={row.original.title}
            fingerprint={row.original.fingerprint}
            severity={row.original.severity}
            parseFailed={row.original.parseFailed}
          />
        ),
      },
      {
        id: "source",
        header: t("events.table.headers.source"),
        cell: ({ row }) => (
          <span className="block truncate" title={row.original.sourceName}>
            {row.original.sourceName}
          </span>
        ),
      },
      {
        id: "state",
        header: t("events.table.headers.state"),
        cell: ({ row }) => <EventStateCell status={row.original.status} />,
      },
      {
        id: "deliveries",
        header: t("events.table.headers.deliveries"),
        cell: ({ row }) => (
          <EventDeliveryCountsCell
            counts={row.original.deliveryCounts}
            routeMatchCount={row.original.routeMatchCount}
          />
        ),
      },
      {
        id: "received",
        header: t("events.table.headers.received"),
        cell: ({ row }) => <OperationTimestamp format="dateTime" value={row.original.receivedAt} />,
      },
      {
        id: "actions",
        header: t("events.table.headers.actions"),
        cell: ({ row }) => (
          <EventActions eventId={row.original.id} pending={pending} onInspect={onInspect} />
        ),
      },
    ],
    [onInspect, pending, t],
  );

  return (
    <section className="bg-background flex min-h-0 flex-1 flex-col">
      <OperationsTable
        data={data}
        columns={columns}
        pageSize={eventsPageSize}
        showPagination={false}
        minWidthClassName={eventsTableMinWidthClassName}
        emptyState={
          <EventsEmptyState hasActiveFilters={hasActiveFilters} onResetFilters={onResetFilters} />
        }
        getRowId={(event) => event.id}
        columnClassName={eventsColumnClassName}
        isPrimaryColumn={(columnId) => columnId === "event"}
        rangeLabel={({ total }) => t("events.table.range", { total })}
        pageLabel={({ page, pageCount }) => t("events.table.page", { page, pageCount })}
        previousLabel={t("events.table.previous")}
        nextLabel={t("events.table.next")}
      />

      {total > 0 ? (
        <TablePagination
          rangeLabel={t("events.table.range", { total })}
          pageLabel={t("events.table.page", {
            page: pageIndex + 1,
            pageCount,
          })}
          previousLabel={t("events.table.previous")}
          nextLabel={t("events.table.next")}
          pageIndex={pageIndex}
          pageCount={pageCount}
          onPageIndexChange={(nextPageIndex) => onPageChange(nextPageIndex + 1)}
        />
      ) : null}
    </section>
  );
}
