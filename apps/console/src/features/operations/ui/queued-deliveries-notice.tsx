import { useQuery } from "@tanstack/react-query";

import type { PendingDeliveryScope } from "#/features/operations/api/operations.queries";
import { pendingDeliveriesQueryOptions } from "#/features/operations/api/operations.queries";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Advisory count of queued deliveries shown inside disable confirmations and
 * edit surfaces.
 *
 * The surrounding copy says whether queued deliveries continue, pause or pick
 * up the edited configuration. This line turns that into a concrete number.
 * It is advisory only: a failed or pending read renders nothing and never
 * blocks the primary action.
 *
 * Edit surfaces pass `hideWhenEmpty` so an empty queue stays silent instead of
 * adding "0 queued" noise next to every save. Disable confirmations keep the
 * zero row because "nothing is waiting" is the answer they were opened for.
 *
 * The count comes from the operations list, which is mounted only while the
 * dialog content is open, so a configuration table does not fan out one count
 * query per row on page load.
 */
export function QueuedDeliveriesNotice({
  scope,
  description,
  hideWhenEmpty = false,
}: {
  scope: PendingDeliveryScope;
  /** Already-translated sentence explaining what the edit does to those jobs. */
  description?: string;
  /** Omit the notice entirely when nothing is queued. */
  hideWhenEmpty?: boolean;
}) {
  const t = useTranslations();
  const queuedDeliveries = useQuery({
    ...pendingDeliveriesQueryOptions(scope),
    select: (operations) => operations.deliveries.total,
  });

  if (queuedDeliveries.isPending || queuedDeliveries.isError) {
    return null;
  }

  if (hideWhenEmpty && queuedDeliveries.data === 0) {
    return null;
  }

  return (
    <div className="text-muted-foreground text-xs/relaxed" aria-live="polite">
      {description ? <p>{description}</p> : null}
      <p>{t("operations.queuedDeliveries.count", { count: queuedDeliveries.data })}</p>
    </div>
  );
}
