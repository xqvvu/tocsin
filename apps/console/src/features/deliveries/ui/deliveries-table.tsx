import type { ColumnDef } from "@tanstack/react-table";
import * as React from "react";

import { OperationsTable } from "#/components/common/operations-table";
import type { ConsoleTableFeatures } from "#/components/common/table-features";
import { TablePagination } from "#/components/common/table-pagination";
import { DeliveriesEmptyState } from "#/features/deliveries/ui/deliveries-empty-state";
import {
  deliveriesColumnClassName,
  deliveriesPageSize,
  deliveriesTableMinWidthClassName,
} from "#/features/deliveries/ui/deliveries-table-layout";
import { DeliveryActions } from "#/features/deliveries/ui/delivery-actions";
import { DeliveryEventCell } from "#/features/deliveries/ui/delivery-event-cell";
import { DeliveryStateBadge } from "#/features/deliveries/ui/delivery-state-badge";
import {
  DeliveryTargetCell,
  type DeliveryDestinationIconName,
} from "#/features/deliveries/ui/delivery-target-cell";
import type { Operations } from "#/features/operations/model/operation-types";
import { OperationTimestamp } from "#/features/operations/ui/operation-timestamp";
import { useTranslations } from "#/i18n/use-i18n";

export function DeliveriesTable({
  deliveries,
  destinationIconNames,
  nextCursor,
  pending,
  canPrevious,
  onInspect,
  onRetry,
  onOlder,
  onPrevious,
}: {
  deliveries: Operations["deliveries"]["items"];
  /** Client-safe destination catalog projected to kind → manifest `iconName`. */
  destinationIconNames: ReadonlyMap<string, string | undefined>;
  nextCursor: string | null;
  pending: boolean;
  /** Whether any earlier page was visited; cursor paging cannot infer this. */
  canPrevious: boolean;
  onInspect: (deliveryId: string) => void;
  onRetry: (deliveryId: string) => void;
  onOlder: (cursor: string) => void;
  onPrevious: () => void;
}) {
  const t = useTranslations();
  const data = React.useMemo(() => deliveries, [deliveries]);
  const columns = React.useMemo<
    Array<ColumnDef<ConsoleTableFeatures, Operations["deliveries"]["items"][number]>>
  >(
    () => [
      {
        id: "target",
        header: t("deliveries.table.headers.target"),
        cell: ({ row }) => (
          <DeliveryTargetCell
            destinationName={row.original.destinationName}
            destinationIconName={deliveryDestinationIconName(
              row.original.destinationKind,
              destinationIconNames,
            )}
            routeName={row.original.routeName}
          />
        ),
      },
      {
        id: "event",
        header: t("deliveries.table.headers.event"),
        cell: ({ row }) => (
          <DeliveryEventCell eventId={row.original.eventId} sourceName={row.original.sourceName} />
        ),
      },
      {
        id: "state",
        header: t("deliveries.table.headers.state"),
        cell: ({ row }) => <DeliveryStateBadge state={row.original.state} />,
      },
      {
        id: "attempts",
        header: t("deliveries.table.headers.attempts"),
        cell: ({ row }) => <span className="font-medium">{row.original.attemptCount}</span>,
      },
      {
        id: "next",
        header: t("deliveries.table.headers.next"),
        cell: ({ row }) =>
          row.original.nextAttemptAt ? (
            <OperationTimestamp format="time" value={row.original.nextAttemptAt} />
          ) : (
            "—"
          ),
      },
      {
        id: "lastError",
        header: t("deliveries.table.headers.lastError"),
        cell: ({ row }) => (
          <span className="block truncate" title={row.original.lastError ?? undefined}>
            {row.original.lastError ?? "—"}
          </span>
        ),
      },
      {
        id: "updated",
        header: t("deliveries.table.headers.updated"),
        cell: ({ row }) => <OperationTimestamp format="dateTime" value={row.original.updatedAt} />,
      },
      {
        id: "actions",
        header: t("deliveries.table.headers.actions"),
        cell: ({ row }) => (
          <DeliveryActions
            delivery={row.original}
            pending={pending}
            onInspect={onInspect}
            onRetry={onRetry}
          />
        ),
      },
    ],
    [destinationIconNames, onInspect, onRetry, pending, t],
  );

  return (
    <section className="bg-background flex min-h-0 flex-1 flex-col">
      <OperationsTable
        data={data}
        columns={columns}
        pageSize={deliveriesPageSize}
        showPagination={false}
        minWidthClassName={deliveriesTableMinWidthClassName}
        emptyState={<DeliveriesEmptyState />}
        getRowId={(delivery) => delivery.id}
        columnClassName={deliveriesColumnClassName}
        isPrimaryColumn={(columnId) => columnId === "target"}
        rangeLabel={({ total }) => t("deliveries.table.range", { total })}
        emptyRangeLabel={t("deliveries.table.emptyRange")}
        pageLabel={({ page, pageCount }) => t("deliveries.table.page", { page, pageCount })}
        previousLabel={t("deliveries.table.previous")}
        nextLabel={t("deliveries.table.next")}
      />

      <TablePagination
        mode="cursor"
        previousLabel={t("deliveries.table.previous")}
        nextLabel={t("deliveries.table.next")}
        canPrevious={canPrevious && !pending}
        // `nextCursor === null` means this is the oldest page reached, so there
        // is nothing further to go to — never a "jump to latest" in disguise.
        canNext={nextCursor !== null && !pending}
        onPrevious={onPrevious}
        onNext={() => {
          if (nextCursor === null) return;
          onOlder(nextCursor);
        }}
      />
    </section>
  );
}

/**
 * Resolves a delivery row's icon through the client-safe catalog rather than a
 * console-side list of known kinds: a row read back from an older snapshot has
 * no kind at all, and a row can outlive a kind that no longer exists — both
 * come back as `null` so the cell degrades deliberately.
 */
function deliveryDestinationIconName(
  destinationKind: string | undefined,
  iconNames: ReadonlyMap<string, string | undefined>,
): DeliveryDestinationIconName {
  if (destinationKind === undefined || !iconNames.has(destinationKind)) {
    return null;
  }

  return iconNames.get(destinationKind);
}
