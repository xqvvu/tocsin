import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";

import type { RouteReplayPreview } from "@tocsin/core";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Badge } from "#/components/ui/badge";
import { useOperationMutations } from "#/features/operations/api/operation.mutations";
import {
  operationsQueryKeys,
  routeReplayPreviewQueryOptions,
} from "#/features/operations/api/operations.queries";
import { useTranslations } from "#/i18n/use-i18n";

export function RouteReplayPrompt({
  routeId,
  onClose,
}: {
  routeId: string | null;
  onClose: () => void;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { replayRouteEvents, invalidateOperations } = useOperationMutations();
  const [pending, setPending] = React.useState(false);
  const replayPreviewQuery = useQuery({
    ...routeReplayPreviewQueryOptions(routeId ?? "__none__"),
    enabled: routeId !== null,
  });
  const preview = replayPreviewQuery.data;
  const candidateEventIds = preview?.candidates.map((candidate) => candidate.event.id) ?? [];
  const canReplay =
    routeId !== null && !pending && !replayPreviewQuery.isFetching && candidateEventIds.length > 0;

  async function handleReplay(): Promise<void> {
    if (!routeId || !canReplay) {
      return;
    }

    setPending(true);

    try {
      const result = await replayRouteEvents({
        routeId,
        eventIds: candidateEventIds,
      });

      if (!result) {
        toast.error(t("routing.replay.toast.notFound"));
        return;
      }

      await Promise.all([
        invalidateOperations(),
        queryClient.invalidateQueries({
          queryKey: operationsQueryKeys.routeReplayPreview(routeId),
        }),
      ]);
      toast.success(t("routing.replay.toast.success"), {
        description: t("routing.replay.toast.successDescription", {
          created: result.createdDeliveryIds.length,
          skipped: result.skippedExistingCount,
        }),
      });
      onClose();
    } catch (error) {
      toast.error(t("routing.replay.toast.failed"), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog
      open={routeId !== null}
      onOpenChange={(open) => {
        if (!open && !pending) {
          onClose();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("routing.replay.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("routing.replay.description")}</AlertDialogDescription>
        </AlertDialogHeader>

        <RouteReplayPreviewBody
          pending={replayPreviewQuery.isPending || replayPreviewQuery.isFetching}
          error={replayPreviewQuery.error}
          preview={preview}
        />

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("routing.replay.cancel")}</AlertDialogCancel>
          <AlertDialogAction disabled={!canReplay} onClick={() => void handleReplay()}>
            {pending ? t("routing.replay.submitting") : t("routing.replay.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RouteReplayPreviewBody({
  pending,
  error,
  preview,
}: {
  pending: boolean;
  error: Error | null;
  preview: RouteReplayPreview | null | undefined;
}) {
  const t = useTranslations();

  if (pending) {
    return <p className="text-muted-foreground text-xs">{t("routing.replay.loading")}</p>;
  }

  if (error) {
    return <p className="text-destructive text-xs">{error.message}</p>;
  }

  if (!preview) {
    return <p className="text-muted-foreground text-xs">{t("routing.replay.notFound")}</p>;
  }

  if (!preview.enabled) {
    return <p className="text-muted-foreground text-xs">{t("routing.replay.disabled")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1">
        <Badge variant="secondary">
          {t("routing.replay.summary.scanned", { count: preview.scannedEventCount })}
        </Badge>
        <Badge variant="outline">
          {t("routing.replay.summary.matched", { count: preview.matchedEventCount })}
        </Badge>
        <Badge variant={preview.newDeliveryCount > 0 ? "default" : "outline"}>
          {t("routing.replay.summary.newDeliveries", { count: preview.newDeliveryCount })}
        </Badge>
      </div>

      {preview.candidates.length === 0 ? (
        <p className="text-muted-foreground text-xs leading-5">{t("routing.replay.empty")}</p>
      ) : (
        <div className="border-border max-h-56 overflow-auto border">
          {preview.candidates.slice(0, 10).map((candidate) => (
            <div
              key={candidate.event.id}
              className="border-border flex min-w-0 flex-col gap-1 border-b p-2 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-1">
                <Badge variant="outline">{candidate.event.severity}</Badge>
                <span className="truncate text-xs font-medium" title={candidate.event.title}>
                  {candidate.event.title}
                </span>
              </div>
              <div className="text-muted-foreground truncate text-[11px]">
                {t("routing.replay.candidateMeta", {
                  source: candidate.event.sourceName,
                  deliveries: candidate.newDeliveryCount,
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
