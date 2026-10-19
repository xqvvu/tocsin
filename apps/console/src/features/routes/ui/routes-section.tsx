import {
  RiDeleteBinLine,
  RiEditLine,
  RiRefreshLine,
  RiRouteLine,
  RiShutDownLine,
} from "@remixicon/react";
import type { ColumnDef } from "@tanstack/react-table";
import * as React from "react";

import type { DestinationSummary, RouteDefinition, SourceSummary } from "@tocsin/core";

import { EnabledStateBadge } from "#/components/common/enabled-state-badge";
import { IconTooltip } from "#/components/common/icon-tooltip";
import { OperationsTable } from "#/components/common/operations-table";
import { powerActionButtonClassName } from "#/components/common/power-action-button";
import type { ConsoleTableFeatures } from "#/components/common/table-features";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#/components/ui/alert-dialog";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { buildRouteRuleChips, describeRouteRule } from "#/features/routes/model/route-rule-summary";
import { routeRuleSummaryCopy } from "#/features/routes/model/route-rule-summary-copy";
import { EditRouteForm } from "#/features/routes/ui/route-forms";
import { useTranslations } from "#/i18n/use-i18n";

type RouteSummary = RouteDefinition;

export interface RoutesSectionProps {
  routes: RouteDefinition[];
  sources: SourceSummary[];
  destinations: DestinationSummary[];
  editingRoute: RouteSummary | null;
  pending: boolean;
  onEdit: (routeId: string) => void;
  onCancelEdit: () => void;
  onPreviewReplay: (route: RouteSummary) => void;
  onToggle: (route: RouteSummary) => void;
  onDelete: (route: RouteSummary) => void;
  onSubmitEdit: (input: {
    id: string;
    name: string;
    rule: RouteSummary["rule"];
    destinationIds: string[];
  }) => void;
}

export function RoutesSection({
  routes,
  sources,
  destinations,
  editingRoute,
  pending,
  onEdit,
  onCancelEdit,
  onPreviewReplay,
  onToggle,
  onDelete,
  onSubmitEdit,
}: RoutesSectionProps) {
  const t = useTranslations();
  const data = React.useMemo(() => routes, [routes]);
  const columns = React.useMemo<Array<ColumnDef<ConsoleTableFeatures, RouteSummary>>>(
    () => [
      {
        id: "name",
        header: t("routing.table.headers.name"),
        cell: ({ row }) => <RouteIdentityCell route={row.original} />,
      },
      {
        id: "rule",
        header: t("routing.table.headers.rule"),
        cell: ({ row }) => <RouteRuleCell route={row.original} sources={sources} />,
      },
      {
        id: "destinations",
        header: t("routing.table.headers.destinations"),
        cell: ({ row }) => (
          <RouteDestinationsCell
            destinationIds={row.original.destinationIds}
            destinations={destinations}
          />
        ),
      },
      {
        id: "state",
        header: t("routing.table.headers.state"),
        cell: ({ row }) => <EnabledStateBadge enabled={row.original.enabled} />,
      },
      {
        id: "actions",
        header: t("routing.table.headers.actions"),
        cell: ({ row }) => (
          <RouteActions
            route={row.original}
            pending={pending}
            onEdit={onEdit}
            onPreviewReplay={onPreviewReplay}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        ),
      },
    ],
    [destinations, onDelete, onEdit, onPreviewReplay, onToggle, pending, sources, t],
  );

  return (
    <section className="bg-background flex min-h-0 min-w-0 flex-1 flex-col">
      <OperationsTable
        data={data}
        columns={columns}
        pageSize={routesPageSize}
        emptyState={<RoutesEmptyState hasDestinations={destinations.length > 0} />}
        getRowId={(route) => route.id}
        columnClassName={routesColumnClassName}
        isPrimaryColumn={(columnId) => columnId === "name"}
        rangeLabel={({ total }) => t("routing.table.pagination.range", { total })}
        pageLabel={({ page, pageCount }) => t("routing.table.pagination.page", { page, pageCount })}
        previousLabel={t("routing.table.pagination.previous")}
        nextLabel={t("routing.table.pagination.next")}
      />
      {editingRoute ? (
        <div className="border-border border-x border-b p-3">
          <EditRouteForm
            key={editingRoute.id}
            route={editingRoute}
            sources={sources}
            destinations={destinations}
            pending={pending}
            onCancel={onCancelEdit}
            onSubmit={onSubmitEdit}
          />
        </div>
      ) : null}
    </section>
  );
}

function RouteActions({
  route,
  pending,
  onEdit,
  onPreviewReplay,
  onToggle,
  onDelete,
}: {
  route: RouteSummary;
  pending: boolean;
  onEdit: (routeId: string) => void;
  onPreviewReplay: (route: RouteSummary) => void;
  onToggle: (route: RouteSummary) => void;
  onDelete: (route: RouteSummary) => void;
}) {
  const t = useTranslations();
  const [disableDialogOpen, setDisableDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const editLabel = t("routing.table.actions.edit");
  const replayLabel = t("routing.table.actions.replayPreview");
  const toggleLabel = route.enabled
    ? t("routing.table.actions.disableTitle")
    : t("routing.table.actions.enableTitle");
  const deleteLabel = t("routing.table.actions.deleteTitle", { routeName: route.name });

  return (
    <div className="flex justify-center gap-1">
      <IconTooltip label={editLabel}>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={pending}
          aria-label={editLabel}
          onClick={() => onEdit(route.id)}
        >
          <RiEditLine data-icon="inline-start" aria-hidden />
        </Button>
      </IconTooltip>
      <IconTooltip label={replayLabel}>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={pending}
          aria-label={replayLabel}
          onClick={() => onPreviewReplay(route)}
        >
          <RiRefreshLine data-icon="inline-start" aria-hidden />
        </Button>
      </IconTooltip>
      {route.enabled ? (
        <AlertDialog
          open={disableDialogOpen}
          onOpenChange={(open) => {
            if (!pending) {
              setDisableDialogOpen(open);
            }
          }}
        >
          <IconTooltip label={toggleLabel}>
            <AlertDialogTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={pending}
                  aria-label={toggleLabel}
                  className={powerActionButtonClassName(route.enabled)}
                />
              }
            >
              <RiShutDownLine data-icon="inline-start" aria-hidden />
            </AlertDialogTrigger>
          </IconTooltip>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("routing.disable.confirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("routing.disable.confirmDescription", {
                  routeName: route.name,
                  destinationCount: route.destinationIds.length,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>
                {t("routing.disable.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={pending}
                onClick={() => {
                  setDisableDialogOpen(false);
                  onToggle(route);
                }}
              >
                {t("routing.disable.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <IconTooltip label={toggleLabel}>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={pending}
            aria-label={toggleLabel}
            className={powerActionButtonClassName(route.enabled)}
            onClick={() => onToggle(route)}
          >
            <RiShutDownLine data-icon="inline-start" aria-hidden />
          </Button>
        </IconTooltip>
      )}
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!pending) {
            setDeleteDialogOpen(open);
          }
        }}
      >
        <IconTooltip label={deleteLabel}>
          <AlertDialogTrigger
            render={
              <Button
                type="button"
                variant="destructive"
                size="icon-xs"
                disabled={pending}
                aria-label={deleteLabel}
              />
            }
          >
            <RiDeleteBinLine data-icon="inline-start" aria-hidden />
          </AlertDialogTrigger>
        </IconTooltip>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("routing.delete.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("routing.delete.confirmDescription", { routeName: route.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t("routing.delete.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setDeleteDialogOpen(false);
                onDelete(route);
              }}
            >
              {t("routing.delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RouteIdentityCell({ route }: { route: RouteSummary }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium" title={route.name}>
        {route.name}
      </div>
      <div className="text-muted-foreground mt-0.5 truncate font-mono text-[11px]" title={route.id}>
        {route.id.slice(0, 12)}
      </div>
    </div>
  );
}

function RouteRuleCell({ route, sources }: { route: RouteSummary; sources: SourceSummary[] }) {
  const t = useTranslations();
  const copy = routeRuleSummaryCopy(t);
  const chips = buildRouteRuleChips(
    route.rule,
    (sourceId) => sourceNameForId(sourceId, sources),
    copy,
  );

  if (chips.length === 0) {
    return (
      <span className="text-muted-foreground text-xs italic">{t("routing.table.allEvents")}</span>
    );
  }

  return (
    <div
      className="flex min-w-0 flex-nowrap gap-1 overflow-hidden"
      title={describeRouteRule(route.rule, copy)}
    >
      {chips.map((chip) => (
        <Badge
          key={chip}
          variant="outline"
          className="max-w-48 min-w-0 shrink truncate font-mono text-[11px]"
        >
          {chip}
        </Badge>
      ))}
    </div>
  );
}

function RouteDestinationsCell({
  destinationIds,
  destinations,
}: {
  destinationIds: string[];
  destinations: DestinationSummary[];
}) {
  const t = useTranslations();
  const resolved = destinationIds.map((id) => {
    return destinations.find((destination) => destination.id === id);
  });
  const names = resolved.map((destination, index) => destination?.name ?? destinationIds[index]);
  const disabledCount = resolved.filter(
    (destination) => destination && !destination.enabled,
  ).length;

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="font-medium">{destinationIds.length}</span>
        {disabledCount > 0 ? (
          <Badge variant="outline" title={t("routing.table.destinations.disabledHint")}>
            {t("routing.table.destinations.disabledCount", { count: disabledCount })}
          </Badge>
        ) : null}
      </div>
      <div className="text-muted-foreground mt-0.5 truncate text-[11px]" title={names.join(", ")}>
        {names.length > 0 ? names.join(", ") : t("routing.table.noDestinations")}
      </div>
    </div>
  );
}

function RoutesEmptyState({ hasDestinations }: { hasDestinations: boolean }) {
  const t = useTranslations();

  return (
    <Empty className="border-none p-4">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <RiRouteLine aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{t("routing.table.empty.title")}</EmptyTitle>
        <EmptyDescription>{t("routing.table.empty.description")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {hasDestinations
          ? t("routing.table.empty.withDestinations")
          : t("routing.table.empty.withoutDestinations")}
      </EmptyContent>
    </Empty>
  );
}

function sourceNameForId(sourceId: string, sources: SourceSummary[]): string {
  return sources.find((source) => source.id === sourceId)?.name ?? sourceId.slice(0, 10);
}

function routesColumnClassName(columnId: string): string | null {
  switch (columnId) {
    case "name":
      return "w-[24%]";
    case "rule":
      return "w-[31%]";
    case "destinations":
      return "w-[19%]";
    case "state":
      return "w-[10%]";
    case "actions":
      return "w-[16%]";
    default:
      return null;
  }
}

const routesPageSize = 10;
