import { Link } from "@tanstack/react-router";

import { buttonVariants } from "#/components/ui/button";
import type { EventDetailData } from "#/features/events/ui/event-detail-types";
import { useTranslations } from "#/i18n/use-i18n";
import { cn } from "#/lib/utils";

/**
 * Silence evidence for one delivery in the event detail table.
 *
 * The reason snapshot and `suppressionId` already travel with the delivery
 * (see `DeliveryJob`), so this cell answers "why was this not sent, and which
 * rule did it" without a second request or a jump to the delivery detail.
 * Rows that were not suppressed keep the shared dash so the column stays
 * scannable.
 */
export function EventDetailDeliverySuppressionCell({
  delivery,
}: {
  delivery: EventDetailData["deliveries"][number];
}) {
  const t = useTranslations();

  if (delivery.state !== "suppressed") {
    return <span className="text-muted-foreground">{t("common.placeholder.empty")}</span>;
  }

  const reason = delivery.suppressReason ?? null;

  return (
    <div className="space-y-0.5 text-xs">
      <div
        className={reason ? "line-clamp-2" : "text-muted-foreground line-clamp-2"}
        title={reason ?? undefined}
      >
        {reason ?? t("deliveries.suppression.unknownReason")}
      </div>
      {delivery.suppressionId ? (
        <Link
          to="/suppressions/$suppressionId"
          params={{ suppressionId: delivery.suppressionId }}
          className={cn(
            buttonVariants({ variant: "link", size: "sm" }),
            "h-auto max-w-full truncate p-0 font-mono text-[11px]",
          )}
          title={delivery.suppressionId}
        >
          {delivery.suppressionId}
        </Link>
      ) : (
        <span className="text-muted-foreground block truncate">
          {t("events.detail.deliverySuppression.ruleDeleted")}
        </span>
      )}
    </div>
  );
}
