import { RiRestartLine } from "@remixicon/react";
import * as React from "react";
import { toast } from "sonner";

import { isDeliveryAcceptedUnrecorded, type DeliveryState } from "@tocsin/core";

import { Button } from "#/components/ui/button";
import { useOperationMutations } from "#/features/operations/api/operation.mutations";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Re-queues a failed delivery from its detail page or an event's delivery table.
 *
 * The list already exposes the same action; an operator who opened one delivery
 * to investigate it should not have to go back to the list to retry. The
 * repository accepts retry only for a failed job, so every other state hides
 * the button instead of failing on click. A delivery whose destination already
 * accepted the alert is terminal-failed only because its success could not be
 * recorded; retrying it would notify on-call twice, so it shows the reason
 * instead of the action.
 */
export function DeliveryRetryButton({
  id,
  state,
  lastError,
}: {
  id: string;
  state: DeliveryState;
  lastError: string | null;
}) {
  const t = useTranslations();
  const { retryDelivery, invalidateOperations } = useOperationMutations();
  const [pending, setPending] = React.useState(false);

  if (state !== "failed") {
    return null;
  }

  if (isDeliveryAcceptedUnrecorded(lastError)) {
    return (
      <p className="text-muted-foreground text-xs">
        {t("deliveries.detail.retry.blockedByAccepted")}
      </p>
    );
  }

  async function retry(): Promise<void> {
    setPending(true);

    try {
      await retryDelivery({ id });

      toast.success(t("deliveries.detail.retry.successTitle"));
      await invalidateOperations();
    } catch (error) {
      toast.error(t("deliveries.detail.retry.failureTitle"), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      className="w-fit"
      onClick={() => void retry()}
    >
      <RiRestartLine data-icon="inline-start" aria-hidden />
      {t("deliveries.detail.retry.action")}
    </Button>
  );
}
