import type { DeliveryState } from "@tocsin/core";

import { Badge } from "#/components/ui/badge";
import type { RouteDeliveryOutcomes } from "#/features/events/ui/event-detail-route-delivery-outcomes";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Outcome order follows the delivery lifecycle, not the schema, so the eye
 * lands on succeeded/failed before queued states. Only states that occurred are
 * rendered; an empty list is explained instead of showing a bare dash.
 */
const OUTCOME_ORDER: DeliveryState[] = ["succeeded", "failed", "running", "pending", "suppressed"];

export function RouteDeliveryOutcomeCell({
  matched,
  outcomes,
}: {
  matched: boolean;
  outcomes: RouteDeliveryOutcomes | undefined;
}) {
  const t = useTranslations();
  const entries = OUTCOME_ORDER.flatMap((state) => {
    const count = outcomes?.[state] ?? 0;

    return count > 0 ? [{ state, count }] : [];
  });

  if (entries.length === 0) {
    return (
      <span className="text-muted-foreground text-xs">
        {matched
          ? t("events.detail.routeDeliveryOutcome.none")
          : t("events.detail.routeDeliveryOutcome.notMatched")}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(({ state, count }) => (
        <Badge
          key={state}
          variant={
            state === "failed" ? "destructive" : state === "succeeded" ? "default" : "secondary"
          }
          className={
            state === "suppressed" ? "border-muted-foreground/40 text-muted-foreground" : undefined
          }
        >
          {t(`common.deliveryState.${state}`)} {count}
        </Badge>
      ))}
    </div>
  );
}
