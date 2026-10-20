import { useQuery } from "@tanstack/react-query";

import type { PendingDeliveryScope } from "#/features/operations/api/operations.queries";
import { pendingDeliveriesQueryOptions } from "#/features/operations/api/operations.queries";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Advisory count of queued deliveries shown inside disable confirmations.
 *
 * The confirmations already say whether queued deliveries continue or pause.
 * This line turns that into a concrete consequence. It is advisory only: a
 * failed or pending read renders nothing and never blocks the primary action.
 *
 * The count comes from the operations list, which is mounted only while the
 * dialog content is open, so a configuration table does not fan out one count
 * query per row on page load.
 */
export function QueuedDeliveriesNotice({ scope }: { scope: PendingDeliveryScope }) {
  const t = useTranslations();
  const queuedDeliveries = useQuery({
    ...pendingDeliveriesQueryOptions(scope),
    select: (operations) => operations.deliveries.total,
  });

  if (queuedDeliveries.isPending || queuedDeliveries.isError) {
    return null;
  }

  return (
    <p className="text-muted-foreground text-xs/relaxed" aria-live="polite">
      {t("operations.queuedDeliveries.count", { count: queuedDeliveries.data })}
    </p>
  );
}
