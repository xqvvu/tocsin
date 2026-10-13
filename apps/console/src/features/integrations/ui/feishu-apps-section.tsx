import type { ColumnDef } from "@tanstack/react-table";
import * as React from "react";

import type { FeishuAppListItem } from "@tocsin/core";

import { OperationsTable } from "#/components/common/operations-table";
import type { ConsoleTableFeatures } from "#/components/common/table-features";
import { FeishuAppActions } from "#/features/integrations/ui/feishu-app-actions";
import { FeishuAppsEmptyState } from "#/features/integrations/ui/feishu-apps-empty-state";
import { OperationTimestamp } from "#/features/operations/ui/operation-timestamp";
import { useTranslations } from "#/i18n/use-i18n";

export function FeishuAppsSection({
  apps,
  pending,
  onTest,
  onEdit,
  onDelete,
}: {
  apps: FeishuAppListItem[];
  pending: boolean;
  onTest: (app: FeishuAppListItem) => void;
  onEdit: (app: FeishuAppListItem) => void;
  onDelete: (app: FeishuAppListItem) => void;
}) {
  const t = useTranslations();
  const data = React.useMemo(() => apps, [apps]);
  const columns = React.useMemo<Array<ColumnDef<ConsoleTableFeatures, FeishuAppListItem>>>(
    () => [
      {
        id: "name",
        header: t("integrations.table.headers.name"),
        cell: ({ row }) => (
          <span className="block truncate font-medium" title={row.original.name}>
            {row.original.name}
          </span>
        ),
      },
      {
        id: "appId",
        header: t("integrations.table.headers.appId"),
        cell: ({ row }) => (
          <span
            className="text-muted-foreground block truncate font-mono text-xs"
            title={row.original.appId}
          >
            {row.original.appId}
          </span>
        ),
      },
      {
        id: "referenced",
        header: t("integrations.table.headers.referenced"),
        cell: ({ row }) => {
          const names = row.original.referencedDestinations.map(
            (reference) => reference.destinationName,
          );

          return (
            <span
              className="text-muted-foreground block truncate text-xs"
              title={names.length === 0 ? undefined : names.join(", ")}
            >
              {names.length === 0 ? t("integrations.table.referenced.none") : names.join("、")}
            </span>
          );
        },
      },
      {
        id: "updated",
        header: t("integrations.table.headers.updatedAt"),
        cell: ({ row }) => <OperationTimestamp format="dateTime" value={row.original.updatedAt} />,
      },
      {
        id: "actions",
        header: t("integrations.table.headers.actions"),
        cell: ({ row }) => (
          <FeishuAppActions
            app={row.original}
            pending={pending}
            onTest={onTest}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ),
      },
    ],
    [onDelete, onEdit, onTest, pending, t],
  );

  return (
    <OperationsTable
      data={data}
      columns={columns}
      pageSize={feishuAppsPageSize}
      emptyState={<FeishuAppsEmptyState />}
      getRowId={(app) => app.id}
      columnClassName={feishuAppsColumnClassName}
      isPrimaryColumn={(columnId) => columnId === "name"}
      rangeLabel={({ total }) => t("integrations.table.pagination.range", { total })}
      emptyRangeLabel={t("integrations.table.pagination.empty")}
      pageLabel={({ page, pageCount }) =>
        t("integrations.table.pagination.page", { page, pageCount })
      }
      previousLabel={t("integrations.table.pagination.previous")}
      nextLabel={t("integrations.table.pagination.next")}
    />
  );
}

/**
 * Column widths follow the other list tables: a primary column, proportional
 * content columns, and a fixed actions column so the buttons do not drift.
 */
function feishuAppsColumnClassName(columnId: string): string | null {
  switch (columnId) {
    case "name":
      return "w-[24%]";
    case "appId":
      return "w-[24%]";
    case "referenced":
      return "w-[26%]";
    case "updated":
      return "w-[14%]";
    case "actions":
      return "w-[12%]";
    default:
      return null;
  }
}

const feishuAppsPageSize = 10;
