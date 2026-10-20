import type { ColumnDef } from "@tanstack/react-table";
import * as React from "react";

import type { RouteDefinition } from "@tocsin/core";

import { EnabledStateBadge } from "#/components/common/enabled-state-badge";
import { OperationsTable } from "#/components/common/operations-table";
import type { ConsoleTableFeatures } from "#/components/common/table-features";
import { destinationRouteCoverage } from "#/features/destinations/model/destination-route-coverage";
import type {
  DestinationCatalog,
  DestinationListItem,
} from "#/features/destinations/model/destination-types";
import { DestinationActions } from "#/features/destinations/ui/destination-actions";
import { DestinationIdentityCell } from "#/features/destinations/ui/destination-identity-cell";
import { destinationIconNamesByKind } from "#/features/destinations/ui/destination-kind-icon";
import { DestinationOperationalConfigCell } from "#/features/destinations/ui/destination-operational-config-cell";
import { DestinationRouteCoverageCell } from "#/features/destinations/ui/destination-route-coverage-cell";
import { DestinationsEmptyState } from "#/features/destinations/ui/destinations-empty-state";
import { routeReferenceImpact } from "#/features/routes/model/route-reference-impact";
import { useTranslations } from "#/i18n/use-i18n";

export interface DestinationsSectionProps {
  destinations: DestinationListItem[];
  /**
   * Client-safe catalog the identity column resolves each row's `iconName`
   * from. Passing the catalog (not a console-side kind list) is what lets a
   * new adapter's icon name work without editing the console.
   */
  destinationCatalog: DestinationCatalog;
  routes: RouteDefinition[];
  pending: boolean;
  onTest: (destination: DestinationListItem) => void;
  onPreview: (destination: DestinationListItem) => void;
  onEdit: (destinationId: string) => void;
  onToggle: (destination: DestinationListItem) => void;
  onDelete: (destination: DestinationListItem) => void;
}

export function DestinationsSection({
  destinations,
  destinationCatalog,
  routes,
  pending,
  onTest,
  onPreview,
  onEdit,
  onToggle,
  onDelete,
}: DestinationsSectionProps) {
  const t = useTranslations();
  const data = React.useMemo(() => destinations, [destinations]);
  const destinationIconNames = React.useMemo(
    () => destinationIconNamesByKind(destinationCatalog),
    [destinationCatalog],
  );
  const columns = React.useMemo<Array<ColumnDef<ConsoleTableFeatures, DestinationListItem>>>(
    () => [
      {
        id: "destination",
        header: t("destinations.table.headers.destination"),
        cell: ({ row }) => (
          <DestinationIdentityCell
            destination={row.original}
            iconName={destinationIconNames.get(row.original.kind)}
          />
        ),
      },
      {
        id: "operationalConfig",
        header: t("destinations.table.headers.operationalConfig"),
        cell: ({ row }) => <DestinationOperationalConfigCell destination={row.original} />,
      },
      {
        id: "routing",
        header: t("destinations.table.headers.routing"),
        cell: ({ row }) => (
          <DestinationRouteCoverageCell
            coverage={destinationRouteCoverage(row.original.id, routes)}
          />
        ),
      },
      {
        id: "status",
        header: t("destinations.table.headers.status"),
        cell: ({ row }) => <EnabledStateBadge enabled={row.original.enabled} />,
      },
      {
        id: "actions",
        header: t("destinations.table.headers.actions"),
        cell: ({ row }) => (
          <DestinationActions
            destination={row.original}
            enabledRouteCount={destinationRouteCoverage(row.original.id, routes).enabledRouteCount}
            deleteImpact={routeReferenceImpact(
              routes,
              (route) => route.destinationIds,
              row.original.id,
            )}
            pending={pending}
            onTest={onTest}
            onPreview={onPreview}
            onEdit={onEdit}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        ),
      },
    ],
    [destinationIconNames, onDelete, onEdit, onPreview, onTest, onToggle, pending, routes, t],
  );

  return (
    <OperationsTable
      data={data}
      columns={columns}
      pageSize={destinationsPageSize}
      emptyState={<DestinationsEmptyState />}
      getRowId={(destination) => destination.id}
      columnClassName={destinationsColumnClassName}
      isPrimaryColumn={(columnId) => columnId === "destination"}
      rangeLabel={({ total }) => t("destinations.table.pagination.range", { total })}
      pageLabel={({ page, pageCount }) =>
        t("destinations.table.pagination.page", { page, pageCount })
      }
      previousLabel={t("destinations.table.pagination.previous")}
      nextLabel={t("destinations.table.pagination.next")}
    />
  );
}

function destinationsColumnClassName(columnId: string): string | null {
  switch (columnId) {
    case "destination":
      return "w-[24%]";
    case "operationalConfig":
      return "w-[24%]";
    case "routing":
      return "w-[14%]";
    case "status":
      return "w-[10%]";
    case "actions":
      return "w-[28%]";
    default:
      return null;
  }
}

const destinationsPageSize = 10;
