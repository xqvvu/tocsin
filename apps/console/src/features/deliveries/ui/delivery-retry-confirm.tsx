import { useQuery } from "@tanstack/react-query";

import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { deliveryRetryPreviewQueryOptions } from "#/features/operations/api/operations.queries";
import { UrgentPagingNotice } from "#/features/operations/ui/urgent-paging-notice";
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
 * the retry. It is not silent though — a pending or failed read renders a
 * muted line rather than nothing, because an empty dialog read exactly like
 * "nobody will be called" on the one confirmation that precedes a phone page.
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
        {preview.isPending ? (
          <RetryPreviewStatus text={t("deliveries.retry.confirm.previewPending")} />
        ) : preview.isError ? (
          <RetryPreviewStatus text={t("deliveries.retry.confirm.previewUnavailable")} />
        ) : preview.data ? (
          <UrgentPagingNotice impact={preview.data.urgentPaging} action="retry" />
        ) : null}
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

/**
 * The preview is still loading, or it failed.
 *
 * Both states used to render nothing at all, which read exactly like the
 * resolved "no urgent calls" answer. The copy stays deliberately weaker than
 * the real warning: a placeholder must never look like a call-free verdict.
 */
function RetryPreviewStatus({ text }: { text: string }) {
  return (
    <p role="status" className="text-muted-foreground text-[11px] leading-5">
      {text}
    </p>
  );
}
