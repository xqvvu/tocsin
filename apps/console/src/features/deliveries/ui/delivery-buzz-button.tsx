import { RiAlarmWarningLine } from "@remixicon/react";
import * as React from "react";
import { toast } from "sonner";

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
import { Button } from "#/components/ui/button";
import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";
import { useOperationMutations } from "#/features/operations/api/operation.mutations";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Manual urgent paging for this delivery.
 *
 * Only deliveries sent through a Feishu app carry the message reference a page
 * acts on; the disabled state explains that instead of failing on click. The
 * call reaches every configured receiver at once, so the button opens a
 * confirmation that states how many people it will wake. A destination with no
 * urgent receivers is disabled up front instead of failing on the request.
 */
export function DeliveryBuzzButton({ detail }: { detail: DeliveryDetailData }) {
  const t = useTranslations();
  const { buzzDelivery, invalidateOperations } = useOperationMutations();
  const [pending, setPending] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const pageable = detail.providerReference !== null;
  const receiverCount = urgentReceiverCount(detail.destinationMetadata);
  const hasReceivers = receiverCount > 0;
  const canPage = pageable && hasReceivers;

  async function buzz(): Promise<void> {
    setPending(true);

    try {
      const result = await buzzDelivery({ id: detail.job.id });

      toast.success(t("deliveries.detail.buzz.successTitle", { count: result.pings.length }));
      await invalidateOperations();
    } catch (error) {
      toast.error(t("deliveries.detail.buzz.failureTitle"), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending || !canPage}
        className="w-fit"
        onClick={() => setConfirming(true)}
      >
        <RiAlarmWarningLine data-icon="inline-start" aria-hidden />
        {t("deliveries.detail.buzz.action")}
      </Button>
      {pageable ? (
        hasReceivers ? null : (
          <span className="text-muted-foreground text-[11px]">
            {t("deliveries.detail.buzz.noReceivers")}
          </span>
        )
      ) : (
        <span className="text-muted-foreground text-[11px]">
          {t("deliveries.detail.buzz.unavailable")}
        </span>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deliveries.detail.buzz.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deliveries.detail.buzz.confirmDescription", { count: receiverCount })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {t("deliveries.detail.buzz.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setConfirming(false);
                void buzz();
              }}
            >
              {t("deliveries.detail.buzz.confirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * The delivery detail DTO carries the current destination's urgent receiver
 * count. Anything missing or malformed means there is nobody to page.
 */
function urgentReceiverCount(metadata: DeliveryDetailData["destinationMetadata"]): number {
  const value = metadata.urgentReceiverCount;

  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
