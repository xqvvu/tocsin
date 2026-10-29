import {
  RiDeleteBinLine,
  RiEditLine,
  RiEyeLine,
  RiNotificationOffLine,
  RiPlayLine,
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
import type { DestinationSourceImpact } from "#/features/destinations/model/destination-source-impact";
import { DestinationScheduledUrgentNotice } from "#/features/destinations/ui/destination-scheduled-urgent-notice";
import { DestinationSourceImpactNotice } from "#/features/destinations/ui/destination-source-impact-notice";
import type { DestinationListItem } from "#/features/destinations/ui/destination-ui-types";
import { QueuedDeliveriesNotice } from "#/features/operations/ui/queued-deliveries-notice";
import type { RouteReferenceImpact } from "#/features/routes/model/route-reference-impact";
import { SuppressionFromDestinationDialog } from "#/features/suppressions/ui/suppression-from-destination-dialog";
import { useTranslations } from "#/i18n/use-i18n";

export function DestinationActions({
  destination,
  enabledRouteCount,
  deleteImpact,
  sourceImpact,
  pending,
  requestDeleteImpact,
  onTest,
  onPreview,
  onEdit,
  onToggle,
  onDelete,
}: {
  destination: DestinationListItem;
  enabledRouteCount: number;
  deleteImpact: RouteReferenceImpact;
  sourceImpact: DestinationSourceImpact;
  pending: boolean;
  requestDeleteImpact: DeletionImpactLoader;
  onTest: (destination: DestinationListItem) => void;
  onPreview: (destination: DestinationListItem) => void;
  onEdit: (destinationId: string) => void;
  onToggle: (destination: DestinationListItem) => void;
  onDelete: (destination: DestinationListItem) => void;
}) {
  const t = useTranslations();
  const [disableDialogOpen, setDisableDialogOpen] = React.useState(false);
  const [enableDialogOpen, setEnableDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const historyImpact = useDeletionImpact(requestDeleteImpact);
  const testLabel = t("destinations.table.actions.testTitle", { name: destination.name });
  const previewLabel = t("destinations.table.actions.previewTitle", {
    name: destination.name,
  });
  const editLabel = t("destinations.table.actions.edit");
  const toggleLabel = destination.enabled
    ? t("destinations.table.actions.disableTitle")
    : t("destinations.table.actions.enableTitle");
  const deleteLabel = t("destinations.table.actions.deleteTitle", { name: destination.name });
  const urgentAutoEnabled = destination.operationalConfig.urgentAutoEnabled === true;
  const urgentReceiverCount = destination.operationalConfig.urgentReceivers?.length ?? 0;

  return (
    <div className="flex justify-center gap-1">
      <IconTooltip label={testLabel}>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={pending}
          aria-label={testLabel}
          onClick={() => onTest(destination)}
        >
          <RiPlayLine data-icon="inline-start" aria-hidden />
        </Button>
      </IconTooltip>
      <IconTooltip label={previewLabel}>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={pending}
          aria-label={previewLabel}
          onClick={() => onPreview(destination)}
        >
          <RiEyeLine data-icon="inline-start" aria-hidden />
        </Button>
      </IconTooltip>
      <IconTooltip label={editLabel}>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={pending}
          aria-label={editLabel}
          onClick={() => onEdit(destination.id)}
        >
          <RiEditLine data-icon="inline-start" aria-hidden />
        </Button>
      </IconTooltip>
      <SuppressionFromDestinationDialog destination={destination} disabled={pending} />
      {destination.enabled ? (
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
                  className={powerActionButtonClassName(destination.enabled)}
                />
              }
            >
              <RiShutDownLine data-icon="inline-start" aria-hidden />
            </AlertDialogTrigger>
          </IconTooltip>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("destinations.disable.confirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {enabledRouteCount > 0
                  ? t("destinations.disable.confirmDescription", {
                      destinationName: destination.name,
                      routeCount: enabledRouteCount,
                    })
                  : t("destinations.disable.confirmDescriptionNoRoutes", {
                      destinationName: destination.name,
                    })}
              </AlertDialogDescription>
              <DestinationSourceImpactNotice impact={sourceImpact} />
              <QueuedDeliveriesNotice scope={{ destinationId: destination.id }} />
              {urgentAutoEnabled ? (
                <Alert variant="destructive">
                  <RiNotificationOffLine aria-hidden />
                  <AlertTitle>{t("destinations.disable.urgentAutoTitle")}</AlertTitle>
                  <AlertDescription>
                    {urgentReceiverCount > 0
                      ? t("destinations.disable.urgentAutoDescription", {
                          count: urgentReceiverCount,
                        })
                      : t("destinations.disable.urgentAutoDescriptionNoReceivers")}
                  </AlertDescription>
                </Alert>
              ) : null}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>
                {t("destinations.disable.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={pending}
                onClick={() => {
                  setDisableDialogOpen(false);
                  onToggle(destination);
                }}
              >
                {t("destinations.disable.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <AlertDialog
          open={enableDialogOpen}
          onOpenChange={(open) => {
            if (!pending) {
              setEnableDialogOpen(open);
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
                  className={powerActionButtonClassName(destination.enabled)}
                />
              }
            >
              <RiShutDownLine data-icon="inline-start" aria-hidden />
            </AlertDialogTrigger>
          </IconTooltip>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("destinations.enable.confirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("destinations.enable.confirmDescription", {
                  destinationName: destination.name,
                })}
              </AlertDialogDescription>
              {/* Re-enabling releases both backlogs at once: queued deliveries
                  resume and scheduled urgent calls start dialing. */}
              <QueuedDeliveriesNotice scope={{ destinationId: destination.id }} />
              <DestinationScheduledUrgentNotice destinationId={destination.id} />
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>
                {t("destinations.enable.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={pending}
                onClick={() => {
                  setEnableDialogOpen(false);
                  onToggle(destination);
                }}
              >
                {t("destinations.enable.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (pending) {
            return;
          }

          setDeleteDialogOpen(open);
          if (open) {
            historyImpact.request(destination.id);
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
            <AlertDialogTitle>{t("destinations.delete.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("destinations.delete.confirmDescription", {
                destinationName: destination.name,
              })}
            </AlertDialogDescription>
            {deleteImpact.deletedRouteCount > 0 ? (
              <Alert variant="destructive">
                <RiRouteLine aria-hidden />
                <AlertTitle>
                  {t("destinations.delete.routeImpactTitle", {
                    count: deleteImpact.deletedRouteCount,
                  })}
                </AlertTitle>
                <AlertDescription>
                  {t("destinations.delete.routeImpactDescription")}
                </AlertDescription>
              </Alert>
            ) : null}
            {deleteImpact.narrowedRouteCount > 0 ? (
              <Alert>
                <RiRouteLine aria-hidden />
                <AlertTitle>
                  {t("destinations.delete.routeNarrowedTitle", {
                    count: deleteImpact.narrowedRouteCount,
                  })}
                </AlertTitle>
                <AlertDescription>
                  {t("destinations.delete.routeNarrowedDescription")}
                </AlertDescription>
              </Alert>
            ) : null}
            <DestinationSourceImpactNotice impact={sourceImpact} />
            <DeletionImpactNotice
              impact={historyImpact.impact}
              state={historyImpact.state}
              confirmed={historyImpact.confirmed}
              onConfirmedChange={historyImpact.setConfirmed}
              onRetry={() => historyImpact.request(destination.id)}
            />
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {t("destinations.delete.cancel")}
            </AlertDialogCancel>
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
                onDelete(destination);
              }}
            >
              {t("destinations.delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
