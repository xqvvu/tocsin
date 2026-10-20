import { RiDeleteBinLine, RiEditLine, RiShieldCheckLine, RiShutDownLine } from "@remixicon/react";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import * as React from "react";

import type {
  DestinationListItem,
  SourceSummary,
  Suppression,
  SuppressionMatcher,
} from "@tocsin/core";
import { suppressionStateAt } from "@tocsin/core";

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
import { OperationTimestamp } from "#/features/operations/ui/operation-timestamp";
import { sortSuppressionsForOperations } from "#/features/suppressions/model/suppression-order";
import {
  buildSuppressionMatcherChips,
  describeSuppressionMatcher,
  type SuppressionSummaryCopy,
} from "#/features/suppressions/model/suppression-summary";
import { EditSuppressionForm } from "#/features/suppressions/ui/suppression-forms";
import { SuppressionStateBadge } from "#/features/suppressions/ui/suppression-state-badge";
import { useNow, useTranslations } from "#/i18n/use-i18n";

export interface SuppressionsSectionProps {
  suppressions: Suppression[];
  sources: SourceSummary[];
  destinations: DestinationListItem[];
  editingSuppression: Suppression | null;
  pending: boolean;
  onEdit: (suppressionId: string) => void;
  onCancelEdit: () => void;
  onToggle: (suppression: Suppression) => void;
  onDelete: (suppression: Suppression) => void;
  onSubmitEdit: (input: {
    id: string;
    name: string;
    kind: Suppression["kind"];
    reason: string | null;
    enabled: boolean;
    startsAt: string;
    endsAt: string;
    matcher: SuppressionMatcher;
  }) => void;
}

export function SuppressionsSection({
  suppressions,
  sources,
  destinations,
  editingSuppression,
  pending,
  onEdit,
  onCancelEdit,
  onToggle,
  onDelete,
  onSubmitEdit,
}: SuppressionsSectionProps) {
  const t = useTranslations();
  const now = useNow();
  // Fixed operational priority, not a user preference: rules that are silencing
  // alerts right now must not be pushed below expired ones by creation time.
  const data = React.useMemo(
    () => sortSuppressionsForOperations(suppressions, now.toISOString()),
    [suppressions, now],
  );
  const columns = React.useMemo<Array<ColumnDef<ConsoleTableFeatures, Suppression>>>(
    () => [
      {
        id: "name",
        header: t("suppressions.table.headers.name"),
        cell: ({ row }) => <SuppressionIdentityCell suppression={row.original} />,
      },
      {
        id: "kind",
        header: t("suppressions.table.headers.kind"),
        cell: ({ row }) => <SuppressionKindCell suppression={row.original} />,
      },
      {
        id: "matcher",
        header: t("suppressions.table.headers.matcher"),
        cell: ({ row }) => (
          <SuppressionMatcherCell
            matcher={row.original.matcher}
            sources={sources}
            destinations={destinations}
          />
        ),
      },
      {
        id: "window",
        header: t("suppressions.table.headers.window"),
        cell: ({ row }) => <SuppressionWindowCell suppression={row.original} />,
      },
      {
        id: "state",
        header: t("suppressions.table.headers.state"),
        cell: ({ row }) => (
          // Rendered from the shared projection, never from a stored column.
          <SuppressionStateBadge state={suppressionStateAt(row.original, now.toISOString())} />
        ),
      },
      {
        id: "actions",
        header: t("suppressions.table.headers.actions"),
        cell: ({ row }) => (
          <SuppressionActions
            suppression={row.original}
            pending={pending}
            onEdit={onEdit}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        ),
      },
    ],
    [destinations, now, onDelete, onEdit, onToggle, pending, sources, t],
  );

  return (
    <section className="bg-background flex min-h-0 min-w-0 flex-1 flex-col">
      <OperationsTable
        data={data}
        columns={columns}
        pageSize={suppressionsPageSize}
        emptyState={<SuppressionsEmptyState />}
        getRowId={(suppression) => suppression.id}
        columnClassName={suppressionsColumnClassName}
        isPrimaryColumn={(columnId) => columnId === "name"}
        rangeLabel={({ total }) => t("suppressions.table.pagination.range", { total })}
        pageLabel={({ page, pageCount }) =>
          t("suppressions.table.pagination.page", { page, pageCount })
        }
        previousLabel={t("suppressions.table.pagination.previous")}
        nextLabel={t("suppressions.table.pagination.next")}
      />
      {editingSuppression ? (
        <div className="border-border border-x border-b p-3">
          <EditSuppressionForm
            suppression={editingSuppression}
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

function SuppressionIdentityCell({ suppression }: { suppression: Suppression }) {
  return (
    <div className="min-w-0">
      <Link
        to="/suppressions/$suppressionId"
        params={{ suppressionId: suppression.id }}
        className="block truncate font-medium hover:underline"
        title={suppression.name}
      >
        {suppression.name}
      </Link>
      <div
        className="text-muted-foreground mt-0.5 truncate text-[11px]"
        title={suppression.reason ?? ""}
      >
        {suppression.reason ?? suppression.id.slice(0, 12)}
      </div>
    </div>
  );
}

function SuppressionKindCell({ suppression }: { suppression: Suppression }) {
  const t = useTranslations();

  return <Badge variant="outline">{t(`suppressions.kind.${suppression.kind}`)}</Badge>;
}

function SuppressionMatcherCell({
  matcher,
  sources,
  destinations,
}: {
  matcher: SuppressionMatcher;
  sources: SourceSummary[];
  destinations: DestinationListItem[];
}) {
  const t = useTranslations();
  const copy = suppressionSummaryCopy(t);
  const chips = buildSuppressionMatcherChips(
    matcher,
    {
      source: (sourceId) =>
        sources.find((source) => source.id === sourceId)?.name ?? sourceId.slice(0, 10),
      destination: (destinationId) =>
        destinations.find((destination) => destination.id === destinationId)?.name ??
        destinationId.slice(0, 10),
    },
    copy,
  );

  if (chips.length === 0) {
    return (
      <Badge variant="destructive" title={copy.everything}>
        {t("suppressions.table.everything")}
      </Badge>
    );
  }

  return (
    <div className="flex min-w-0 flex-wrap gap-1" title={describeSuppressionMatcher(chips, copy)}>
      {chips.slice(0, 3).map((chip) => (
        <Badge key={chip} variant="outline" className="max-w-full truncate font-mono text-[11px]">
          {chip}
        </Badge>
      ))}
      {chips.length > 3 ? (
        <Badge variant="outline" className="font-mono text-[11px]">
          {t("suppressions.table.moreConditions", { count: chips.length - 3 })}
        </Badge>
      ) : null}
    </div>
  );
}

function SuppressionWindowCell({ suppression }: { suppression: Suppression }) {
  return (
    <div className="min-w-0 text-[11px]">
      <div className="truncate">
        <OperationTimestamp format="dateTime" value={suppression.startsAt} />
      </div>
      <div className="text-muted-foreground truncate">
        <OperationTimestamp format="dateTime" value={suppression.endsAt} />
      </div>
    </div>
  );
}

function SuppressionActions({
  suppression,
  pending,
  onEdit,
  onToggle,
  onDelete,
}: {
  suppression: Suppression;
  pending: boolean;
  onEdit: (suppressionId: string) => void;
  onToggle: (suppression: Suppression) => void;
  onDelete: (suppression: Suppression) => void;
}) {
  const t = useTranslations();
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const editLabel = t("suppressions.table.actions.edit");
  const toggleLabel = suppression.enabled
    ? t("suppressions.table.actions.disableTitle", { suppressionName: suppression.name })
    : t("suppressions.table.actions.enableTitle", { suppressionName: suppression.name });
  const deleteLabel = t("suppressions.table.actions.deleteTitle", {
    suppressionName: suppression.name,
  });

  return (
    <div className="flex justify-center gap-1">
      <IconTooltip label={editLabel}>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={pending}
          aria-label={editLabel}
          onClick={() => onEdit(suppression.id)}
        >
          <RiEditLine data-icon="inline-start" aria-hidden />
        </Button>
      </IconTooltip>
      <IconTooltip label={toggleLabel}>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={pending}
          aria-label={toggleLabel}
          className={powerActionButtonClassName(suppression.enabled)}
          onClick={() => onToggle(suppression)}
        >
          <RiShutDownLine data-icon="inline-start" aria-hidden />
        </Button>
      </IconTooltip>
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
            <AlertDialogTitle>{t("suppressions.delete.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("suppressions.delete.confirmDescription", {
                suppressionName: suppression.name,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {t("suppressions.delete.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setDeleteDialogOpen(false);
                onDelete(suppression);
              }}
            >
              {t("suppressions.delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SuppressionsEmptyState() {
  const t = useTranslations();

  return (
    <Empty className="border-none p-4">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <RiShieldCheckLine aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{t("suppressions.table.empty.title")}</EmptyTitle>
        <EmptyDescription>{t("suppressions.table.empty.description")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>{t("suppressions.table.empty.content")}</EmptyContent>
    </Empty>
  );
}

function suppressionSummaryCopy(t: ReturnType<typeof useTranslations>): SuppressionSummaryCopy {
  return {
    everything: t("suppressions.matcher.everything"),
    source: t("suppressions.matcher.source"),
    destination: t("suppressions.matcher.destination"),
    severity: t("suppressions.matcher.severity"),
    status: t("suppressions.matcher.status"),
    fingerprint: t("suppressions.matcher.fingerprint"),
    labels: t("suppressions.matcher.labels"),
    titleContains: t("suppressions.matcher.titleContains"),
    messageContains: t("suppressions.matcher.messageContains"),
    severityLabel: (severity) => t(`common.severity.${severity}`),
    statusLabel: (status) => t(`common.alertStatus.${status}`),
  };
}

function suppressionsColumnClassName(columnId: string): string | null {
  switch (columnId) {
    case "name":
      return "w-[20%]";
    case "kind":
      return "w-[10%]";
    case "matcher":
      return "w-[30%]";
    case "window":
      return "w-[18%]";
    case "state":
      return "w-[10%]";
    case "actions":
      return "w-[12%]";
    default:
      return null;
  }
}

const suppressionsPageSize = 10;
