import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import * as React from "react";

import type { NumberedPage } from "@tocsin/core";

import { OperationsTable } from "#/components/common/operations-table";
import type { ConsoleTableFeatures } from "#/components/common/table-features";
import { TablePagination } from "#/components/common/table-pagination";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "#/components/ui/empty";
import { DeliveryStateBadge } from "#/features/deliveries/ui/delivery-state-badge";
import type { DeliveryListItem } from "#/features/operations/model/operation-types";
import { OperationTimestamp } from "#/features/operations/ui/operation-timestamp";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * The deliveries a suppression silenced ("hit list", PRD §2.5 / story 24).
 *
 * Rows link to the delivery detail, where the reason snapshot stays readable
 * even after the rule is deleted.
 */
export function SuppressionHitsTable({
  hits,
  page,
  onPageChange,
}: {
  hits: NumberedPage<DeliveryListItem>;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const t = useTranslations();
  const data = React.useMemo(() => hits.items, [hits.items]);
  const pageSize = Math.max(hits.pageSize, 1);
  const pageCount = Math.max(Math.ceil(hits.total / pageSize), 1);
  // The server clamps an out-of-range page, so believe its answer over the
  // requested page rather than rendering an empty page that claims to exist.
  const effectivePage = hits.page ?? page;
  const pageIndex = Math.min(Math.max(effectivePage - 1, 0), pageCount - 1);
  const columns = React.useMemo<Array<ColumnDef<ConsoleTableFeatures, DeliveryListItem>>>(
    () => [
      {
        id: "event",
        header: t("suppressions.hits.headers.event"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              to="/events/$eventId"
              params={{ eventId: row.original.eventId }}
              className="block truncate font-medium hover:underline"
            >
              {row.original.sourceName}
            </Link>
            <div className="text-muted-foreground mt-0.5 truncate font-mono text-[11px]">
              {row.original.eventId}
            </div>
          </div>
        ),
      },
      {
        id: "destination",
        header: t("suppressions.hits.headers.destination"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{row.original.destinationName}</div>
            <div className="text-muted-foreground mt-0.5 truncate text-[11px]">
              {row.original.routeName ?? t("suppressions.hits.manual")}
            </div>
          </div>
        ),
      },
      {
        id: "state",
        header: t("suppressions.hits.headers.state"),
        cell: ({ row }) => <DeliveryStateBadge state={row.original.state} />,
      },
      {
        id: "attempts",
        header: t("suppressions.hits.headers.attempts"),
        cell: ({ row }) => <span className="font-medium">{row.original.attemptCount}</span>,
      },
      {
        id: "updated",
        header: t("suppressions.hits.headers.updated"),
        cell: ({ row }) => <OperationTimestamp format="dateTime" value={row.original.updatedAt} />,
      },
      {
        id: "actions",
        header: t("suppressions.hits.headers.actions"),
        cell: ({ row }) => (
          <Link
            to="/deliveries/$deliveryId"
            params={{ deliveryId: row.original.id }}
            className="font-medium underline-offset-4 hover:underline"
          >
            {t("suppressions.hits.inspect")}
          </Link>
        ),
      },
    ],
    [t],
  );

  return (
    <section className="bg-background flex min-h-0 flex-1 flex-col">
      <div className="border-border bg-card flex flex-wrap items-center justify-between gap-2 border-x border-t px-3 py-2">
        <h2 className="text-sm font-semibold">{t("suppressions.detail.hitsPanelTitle")}</h2>
        <span className="text-muted-foreground text-xs">
          {t("suppressions.detail.hitsDescription")}
        </span>
      </div>
      <OperationsTable
        data={data}
        columns={columns}
        pageSize={pageSize}
        showPagination={false}
        emptyState={
          <Empty className="border-none p-4">
            <EmptyHeader>
              <EmptyTitle>{t("suppressions.hits.empty.title")}</EmptyTitle>
              <EmptyDescription>{t("suppressions.hits.empty.description")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
        getRowId={(hit) => hit.id}
        columnClassName={hitsColumnClassName}
        isPrimaryColumn={(columnId) => columnId === "event"}
        rangeLabel={({ total }) => t("suppressions.hits.pagination.range", { total })}
        emptyRangeLabel={t("suppressions.hits.pagination.empty")}
        pageLabel={({ page: currentPage, pageCount: count }) =>
          t("suppressions.hits.pagination.page", { page: currentPage, pageCount: count })
        }
        previousLabel={t("suppressions.hits.pagination.previous")}
        nextLabel={t("suppressions.hits.pagination.next")}
      />
      <TablePagination
        rangeLabel={
          hits.total > 0
            ? t("suppressions.hits.pagination.range", { total: hits.total })
            : t("suppressions.hits.pagination.empty")
        }
        pageLabel={t("suppressions.hits.pagination.page", {
          page: pageIndex + 1,
          pageCount,
        })}
        previousLabel={t("suppressions.hits.pagination.previous")}
        nextLabel={t("suppressions.hits.pagination.next")}
        pageIndex={pageIndex}
        pageCount={pageCount}
        onPageIndexChange={(nextIndex) => onPageChange(nextIndex + 1)}
      />
    </section>
  );
}

function hitsColumnClassName(columnId: string): string | null {
  switch (columnId) {
    case "event":
      return "w-[26%]";
    case "destination":
      return "w-[24%]";
    case "state":
      return "w-[14%]";
    case "attempts":
      return "w-[10%]";
    case "updated":
      return "w-[16%]";
    case "actions":
      return "w-[10%]";
    default:
      return null;
  }
}
