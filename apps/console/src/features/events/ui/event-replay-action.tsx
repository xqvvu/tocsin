import { RiRefreshLine } from "@remixicon/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";

import type { EventReplayPreview } from "@tocsin/core";

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
import { useOperationMutations } from "#/features/operations/api/operation.mutations";
import {
  eventReplayPreviewQueryOptions,
  operationsQueryKeys,
} from "#/features/operations/api/operations.queries";
import { useTranslations } from "#/i18n/use-i18n";

export function EventReplayAction({
  eventId,
  disabled = false,
}: {
  eventId: string;
  disabled?: boolean;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { replayEvent, invalidateOperations } = useOperationMutations();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const previewQuery = useQuery({
    ...eventReplayPreviewQueryOptions(eventId),
    enabled: open && !disabled,
  });
  const preview = previewQuery.data;
  const canReplay =
    !disabled && !pending && preview !== null && (preview?.newDeliveryCount ?? 0) > 0;

  async function handleReplay(): Promise<void> {
    if (!canReplay) {
      return;
    }

    setPending(true);

    try {
      const result = await replayEvent({
        eventId,
      });

      if (!result) {
        toast.error(t("events.replay.toast.notFound"));
        return;
      }

      await Promise.all([
        invalidateOperations(),
        queryClient.invalidateQueries({
          queryKey: operationsQueryKeys.eventDetail(eventId),
        }),
        queryClient.invalidateQueries({
          queryKey: operationsQueryKeys.eventReplayPreview(eventId),
        }),
      ]);
      toast.success(t("events.replay.toast.success"), {
        description: t("events.replay.toast.successDescription", {
          created: result.createdDeliveryIds.length,
          skipped: result.skippedExistingCount,
        }),
      });
      setOpen(false);
    } catch (error) {
      toast.error(t("events.replay.toast.failed"), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) {
          setOpen(nextOpen);
        }
      }}
    >
      <AlertDialogTrigger
        render={
          <Button type="button" variant="outline" size="sm" disabled={disabled} className="w-fit" />
        }
      >
        <RiRefreshLine data-icon="inline-start" aria-hidden />
        {t("events.replay.action")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("events.replay.confirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("events.replay.confirmDescription")}</AlertDialogDescription>
        </AlertDialogHeader>

        <ReplayPreviewBody
          pending={previewQuery.isPending || previewQuery.isFetching}
          error={previewQuery.error}
          preview={preview}
        />

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("events.replay.cancel")}</AlertDialogCancel>
          <AlertDialogAction disabled={!canReplay} onClick={() => void handleReplay()}>
            {pending ? t("events.replay.submitting") : t("events.replay.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReplayPreviewBody({
  pending,
  error,
  preview,
}: {
  pending: boolean;
  error: Error | null;
  preview: EventReplayPreview | null | undefined;
}) {
  const t = useTranslations();

  if (pending) {
    return <p className="text-muted-foreground text-xs">{t("events.replay.previewLoading")}</p>;
  }

  if (error) {
    return <p className="text-destructive text-xs">{error.message}</p>;
  }

  if (!preview) {
    return <p className="text-muted-foreground text-xs">{t("events.replay.previewNotFound")}</p>;
  }

  const noMatchedRoutes = preview.targets.length === 0;
  const noNewDeliveries = preview.targets.length > 0 && preview.newDeliveryCount === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1">
        <Badge variant={noMatchedRoutes ? "outline" : "secondary"}>
          {t("events.replay.previewRoutes", { count: preview.matchedRouteCount })}
        </Badge>
        <Badge variant={preview.newDeliveryCount > 0 ? "default" : "outline"}>
          {t("events.replay.previewNew", { count: preview.newDeliveryCount })}
        </Badge>
        <Badge variant="outline">
          {t("events.replay.previewExisting", { count: preview.existingDeliveryCount })}
        </Badge>
      </div>
      <p className="text-muted-foreground text-xs leading-5">
        {noMatchedRoutes
          ? t("events.replay.previewNoRoutes")
          : noNewDeliveries
            ? t("events.replay.previewNoNew")
            : t("events.replay.previewReady")}
      </p>
    </div>
  );
}
