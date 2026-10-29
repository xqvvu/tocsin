import { useQuery } from "@tanstack/react-query";

import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { DeliveryRetryRiskStatus } from "#/features/deliveries/ui/delivery-retry-risk-status";
import { deliveryRetryPreviewQueryOptions } from "#/features/operations/api/operations.queries";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * The one confirmation every retry entry point shows.
 *
 * The list used to confirm while the detail page and an event's delivery table
 * retried on a single click, and none of them mentioned the phone call a
 * successful retry can place. The preview reads the same automatic paging gate
 * the worker uses, so the dialog names the people who could be called before
 * the operator commits to a resend that has no undo.
 *
 * Like the queued-deliveries count, the preview is advisory: it never blocks
 * the retry. It is not silent though — every state renders in one slot, because
 * an empty one read exactly like "nobody will be called" on the one
 * confirmation that precedes a phone page.
 */
export function DeliveryRetryConfirmContent({
  deliveryId,
  destinationName,
  attempt,
  maxAttempts,
  pending,
  onConfirm,
}: {
  deliveryId: string;
  destinationName: string;
  attempt: number;
  maxAttempts: number;
  pending: boolean;
  onConfirm: () => void;
}) {
  const t = useTranslations();
  const preview = useQuery(deliveryRetryPreviewQueryOptions(deliveryId));

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{t("deliveries.retry.confirm.title")}</AlertDialogTitle>
        <AlertDialogDescription>
          {t("deliveries.retry.confirm.description", {
            destination: destinationName,
            attempt,
            max: maxAttempts,
          })}
        </AlertDialogDescription>
        <DeliveryRetryRiskStatus
          isPending={preview.isPending}
          isError={preview.isError}
          preview={preview.data}
        />
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>{t("common.actions.cancel")}</AlertDialogCancel>
        <AlertDialogAction disabled={pending} onClick={onConfirm}>
          {t("deliveries.retry.confirm.confirm")}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}
