import { RiNotificationOffLine } from "@remixicon/react";

import type { DeliveryRetrySuppression } from "@tocsin/core";

import { useOperationDateFormatter } from "#/features/operations/model/operation-format";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * The silence rule that would swallow this retry.
 *
 * A retry re-queues the job, and the worker re-evaluates suppression rules
 * when it claims the job — an active rule turns the retry terminal before any
 * send. Without this notice the dialog would describe a resend that never
 * reaches the destination, which is the opposite of what the operator is about
 * to confirm. It is deliberately calmer than `UrgentPagingNotice`: nothing
 * irreversible happens here.
 */
export function DeliveryRetrySuppressionNotice({
  suppression,
}: {
  suppression: DeliveryRetrySuppression;
}) {
  const t = useTranslations();
  const { formatDateTimeCompact } = useOperationDateFormatter();

  const kind = suppression.suppressionKind
    ? t(`suppressions.kind.${suppression.suppressionKind}`)
    : t("deliveries.retry.confirm.suppressionKindFallback");
  const endsAt = suppression.endsAt ? formatDateTimeCompact(suppression.endsAt) : null;

  return (
    <div role="note" className="border-border bg-muted/30 flex flex-col gap-1 border p-2">
      <p className="flex items-center gap-1 text-xs font-medium">
        <RiNotificationOffLine data-icon="inline-start" aria-hidden />
        {t("deliveries.retry.confirm.suppressionTitle", {
          name: suppression.suppressionName ?? "",
        })}
      </p>
      <p className="text-muted-foreground text-[11px] leading-5">
        {endsAt
          ? t("deliveries.retry.confirm.suppressionDetail", { kind, time: endsAt })
          : t("deliveries.retry.confirm.suppressionDetailOpenEnded", { kind })}
      </p>
      {/* The window can close between confirmation and the claim; saying so
          keeps the notice from reading as a guarantee that nothing is sent. */}
      <p className="text-muted-foreground text-[11px] leading-5">
        {t("deliveries.retry.confirm.suppressionNote")}
      </p>
    </div>
  );
}
