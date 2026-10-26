import {
  RiDeleteBinLine,
  RiEditLine,
  RiKey2Line,
  RiRouteLine,
  RiShutDownLine,
} from "@remixicon/react";
import * as React from "react";

import { DeletionImpactNotice } from "#/components/common/deletion-impact-notice";
import { IconTooltip } from "#/components/common/icon-tooltip";
import { powerActionButtonClassName } from "#/components/common/power-action-button";
import {
  deletionImpactBlocksConfirm,
  type DeletionImpactLoader,
  useDeletionImpact,
} from "#/components/common/use-deletion-impact";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
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
import { Button } from "#/components/ui/button";
import { QueuedDeliveriesNotice } from "#/features/operations/ui/queued-deliveries-notice";
import type { RouteReferenceImpact } from "#/features/routes/model/route-reference-impact";
import type { SourceSummary } from "#/features/sources/ui/source-ui-types";
import { useTranslations } from "#/i18n/use-i18n";

export function SourceActions({
  source,
  enabledRouteCount,
  deleteImpact,
  pending,
  requestDeleteImpact,
  onEdit,
  onToggle,
  onRotateToken,
  onDelete,
}: {
  source: SourceSummary;
  enabledRouteCount: number;
  deleteImpact: RouteReferenceImpact;
  pending: boolean;
  requestDeleteImpact: DeletionImpactLoader;
  onEdit: (sourceId: string) => void;
  onToggle: (source: SourceSummary) => void;
  onRotateToken: (source: SourceSummary) => void;
  onDelete: (source: SourceSummary) => void;
}) {
  const t = useTranslations();
  const [disableDialogOpen, setDisableDialogOpen] = React.useState(false);
  const [rotateDialogOpen, setRotateDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const historyImpact = useDeletionImpact(requestDeleteImpact);
  const editLabel = t("sources.table.actions.edit");
  const rotateTokenLabel = t("sources.table.actions.rotateToken");
  const toggleLabel = source.enabled
    ? t("sources.table.actions.disable")
    : t("sources.table.actions.enable");
  const deleteLabel = t("sources.table.actions.delete");

  return (
    <div className="flex justify-center gap-1">
      <IconTooltip label={editLabel}>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={pending}
          aria-label={editLabel}
          onClick={() => onEdit(source.id)}
        >
          <RiEditLine data-icon="inline-start" aria-hidden />
        </Button>
      </IconTooltip>
      <AlertDialog
        open={rotateDialogOpen}
        onOpenChange={(open) => {
          if (!pending) {
            setRotateDialogOpen(open);
          }
        }}
      >
        <IconTooltip label={rotateTokenLabel}>
          <AlertDialogTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={pending}
                aria-label={rotateTokenLabel}
              />
            }
          >
            <RiKey2Line data-icon="inline-start" aria-hidden />
          </AlertDialogTrigger>
        </IconTooltip>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sources.rotate.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("sources.rotate.confirmDescription", { sourceName: source.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t("sources.rotate.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setRotateDialogOpen(false);
                onRotateToken(source);
              }}
            >
              {t("sources.rotate.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {source.enabled ? (
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
                  className={powerActionButtonClassName(source.enabled)}
                />
              }
            >
              <RiShutDownLine data-icon="inline-start" aria-hidden />
            </AlertDialogTrigger>
          </IconTooltip>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("sources.disable.confirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {enabledRouteCount > 0
                  ? t("sources.disable.confirmDescription", {
                      sourceName: source.name,
                      routeCount: enabledRouteCount,
                    })
                  : t("sources.disable.confirmDescriptionNoRoutes", {
                      sourceName: source.name,
                    })}
              </AlertDialogDescription>
              <QueuedDeliveriesNotice scope={{ sourceId: source.id }} />
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>
                {t("sources.disable.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={pending}
                onClick={() => {
                  setDisableDialogOpen(false);
                  onToggle(source);
                }}
              >
                {t("sources.disable.confirm")}
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
            className={powerActionButtonClassName(source.enabled)}
            onClick={() => onToggle(source)}
          >
            <RiShutDownLine data-icon="inline-start" aria-hidden />
          </Button>
        </IconTooltip>
      )}
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (pending) {
            return;
          }

          setDeleteDialogOpen(open);
          if (open) {
            historyImpact.request(source.id);
          } else {
            historyImpact.reset();
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
            <AlertDialogTitle>{t("sources.delete.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("sources.delete.confirmDescription", { sourceName: source.name })}
            </AlertDialogDescription>
            {deleteImpact.deletedRouteCount > 0 ? (
              <Alert variant="destructive">
                <RiRouteLine aria-hidden />
                <AlertTitle>
                  {t("sources.delete.routeImpactTitle", { count: deleteImpact.deletedRouteCount })}
                </AlertTitle>
                <AlertDescription>{t("sources.delete.routeImpactDescription")}</AlertDescription>
              </Alert>
            ) : null}
            {deleteImpact.narrowedRouteCount > 0 ? (
              <Alert>
                <RiRouteLine aria-hidden />
                <AlertTitle>
                  {t("sources.delete.routeNarrowedTitle", {
                    count: deleteImpact.narrowedRouteCount,
                  })}
                </AlertTitle>
                <AlertDescription>{t("sources.delete.routeNarrowedDescription")}</AlertDescription>
              </Alert>
            ) : null}
            <DeletionImpactNotice
              impact={historyImpact.impact}
              state={historyImpact.state}
              confirmed={historyImpact.confirmed}
              onConfirmedChange={historyImpact.setConfirmed}
              onRetry={() => historyImpact.request(source.id)}
            />
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t("sources.delete.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={
                pending ||
                deletionImpactBlocksConfirm(
                  historyImpact.impact,
                  historyImpact.state,
                  historyImpact.confirmed,
                )
              }
              onClick={() => {
                setDeleteDialogOpen(false);
                onDelete(source);
              }}
            >
              {t("sources.delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
