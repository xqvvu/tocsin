import type { ColumnDef } from "@tanstack/react-table";
import * as React from "react";

import type { RouteDefinition, SourceSummary } from "@tocsin/core";

import { EnabledStateBadge } from "#/components/common/enabled-state-badge";
import { OperationsTable } from "#/components/common/operations-table";
import type { ConsoleTableFeatures } from "#/components/common/table-features";
import { sourceRouteCoverage } from "#/features/sources/model/source-route-coverage";
import { SourceActions } from "#/features/sources/ui/source-actions";
import { SourceIdentityCell } from "#/features/sources/ui/source-identity-cell";
import { SourceRouteCoverageCell } from "#/features/sources/ui/source-route-coverage-cell";
import { SourceWebhookCell } from "#/features/sources/ui/source-webhook-cell";
import { SourcesEmptyState } from "#/features/sources/ui/sources-empty-state";
import { useTranslations } from "#/i18n/use-i18n";

export interface SourcesSectionProps {
  sources: SourceSummary[];
  routes: RouteDefinition[];
  pending: boolean;
  onEdit: (sourceId: string) => void;
  onToggle: (source: SourceSummary) => void;
  onRotateToken: (source: SourceSummary) => void;
  onDelete: (source: SourceSummary) => void;
}

export function SourcesSection({
  sources,
  routes,
  pending,
  onEdit,
  onToggle,
  onRotateToken,
  onDelete,
}: SourcesSectionProps) {
  const t = useTranslations();
  const data = React.useMemo(() => sources, [sources]);
  const columns = React.useMemo<Array<ColumnDef<ConsoleTableFeatures, SourceSummary>>>(
    () => [
      {
        id: "source",
        header: t("sources.table.headers.source"),
        cell: ({ row }) => <SourceIdentityCell source={row.original} />,
      },
      {
        id: "webhook",
        header: t("sources.table.headers.intake"),
        cell: ({ row }) => <SourceWebhookCell sourceId={row.original.id} />,
      },
      {
        id: "routes",
        header: t("sources.table.headers.routes"),
        cell: ({ row }) => (
          <SourceRouteCoverageCell coverage={sourceRouteCoverage(row.original.id, routes)} />
        ),
      },
      {
        id: "status",
        header: t("sources.table.headers.status"),
        cell: ({ row }) => <EnabledStateBadge enabled={row.original.enabled} />,
      },
      {
        id: "actions",
        header: t("sources.table.headers.actions"),
        cell: ({ row }) => (
          <SourceActions
            source={row.original}
            pending={pending}
            onEdit={onEdit}
            onToggle={onToggle}
            onRotateToken={onRotateToken}
            onDelete={onDelete}
          />
        ),
      },
    ],
    [onDelete, onEdit, onRotateToken, onToggle, pending, routes, t],
  );

  return (
    <OperationsTable
      data={data}
      columns={columns}
      pageSize={sourcesPageSize}
      emptyState={<SourcesEmptyState />}
      getRowId={(source) => source.id}
      columnClassName={sourcesColumnClassName}
      isPrimaryColumn={(columnId) => columnId === "source"}
      rangeLabel={({ total }) => t("sources.table.pagination.range", { total })}
      pageLabel={({ page, pageCount }) => t("sources.table.pagination.page", { page, pageCount })}
      previousLabel={t("sources.table.pagination.previous")}
      nextLabel={t("sources.table.pagination.next")}
    />
  );
}

function sourcesColumnClassName(columnId: string): string | null {
  switch (columnId) {
    case "source":
      return "w-[29%]";
    case "webhook":
      return "w-[29%]";
    case "routes":
      return "w-[13%]";
    case "status":
      return "w-[11%]";
    case "actions":
      return "w-[18%]";
    default:
      return null;
  }
}

const sourcesPageSize = 10;
