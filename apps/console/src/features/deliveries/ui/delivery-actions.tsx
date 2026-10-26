import { RiEyeLine, RiRestartLine } from "@remixicon/react";

import { isDeliveryAcceptedUnrecorded } from "@tocsin/core";

import { IconTooltip } from "#/components/common/icon-tooltip";
import { Button } from "#/components/ui/button";
import type { Operations } from "#/features/operations/model/operation-types";
import { useTranslations } from "#/i18n/use-i18n";

export function DeliveryActions({
  delivery,
  pending,
  onInspect,
  onRetry,
}: {
  delivery: Operations["deliveries"]["items"][number];
  pending: boolean;
  onInspect: (deliveryId: string) => void;
  onRetry: (deliveryId: string) => void;
}) {
  const t = useTranslations();
  const retryLabel = t("deliveries.table.retry");
  const inspectLabel = t("deliveries.table.inspect");
  // A retry would resend an alert the destination already accepted; the
  // last-error column carries the explanation, so the icon is omitted.
  const canRetry = delivery.state === "failed" && !isDeliveryAcceptedUnrecorded(delivery.lastError);

  return (
    <div className="flex justify-center gap-1">
      {canRetry ? (
        <IconTooltip label={retryLabel}>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={pending}
            aria-label={retryLabel}
            onClick={() => onRetry(delivery.id)}
          >
            <RiRestartLine data-icon="inline-start" aria-hidden />
          </Button>
        </IconTooltip>
      ) : null}
      <IconTooltip label={inspectLabel}>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={pending}
          aria-label={inspectLabel}
          onClick={() => onInspect(delivery.id)}
        >
          <RiEyeLine data-icon="inline-start" aria-hidden />
        </Button>
      </IconTooltip>
    </div>
  );
}
