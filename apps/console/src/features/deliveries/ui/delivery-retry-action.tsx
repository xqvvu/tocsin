import { RiRestartLine } from "@remixicon/react";
import * as React from "react";

import { IconTooltip } from "#/components/common/icon-tooltip";
import { AlertDialog, AlertDialogContent, AlertDialogTrigger } from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import { DeliveryRetryConfirmContent } from "#/features/deliveries/ui/delivery-retry-confirm";
import type { Operations } from "#/features/operations/model/operation-types";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Row-level retry for a failed delivery.
 *
 * The icon sits beside "inspect" at 24px, so a stray click would re-queue the
 * job and notify the production channel again with no undo. The confirmation
 * names the destination and shows how much of the attempt budget is spent, so
 * the operator can tell an intended retry from a misclick.
 */
export function DeliveryRetryAction({
  delivery,
  pending,
  onRetry,
}: {
  delivery: Operations["deliveries"]["items"][number];
  pending: boolean;
  onRetry: (deliveryId: string) => void;
}) {
  const t = useTranslations();
  const label = t("deliveries.table.retry");
  const [confirming, setConfirming] = React.useState(false);

  return (
    <AlertDialog open={confirming} onOpenChange={setConfirming}>
      <IconTooltip label={label}>
        <AlertDialogTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={pending}
              aria-label={label}
            />
          }
        >
          <RiRestartLine data-icon="inline-start" aria-hidden />
        </AlertDialogTrigger>
      </IconTooltip>
      <AlertDialogContent size="sm">
        <DeliveryRetryConfirmContent
          deliveryId={delivery.id}
          destinationName={delivery.destinationName}
          attempt={delivery.attemptCount}
          maxAttempts={delivery.maxAttempts}
          pending={pending}
          onConfirm={() => {
            setConfirming(false);
            onRetry(delivery.id);
          }}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}
