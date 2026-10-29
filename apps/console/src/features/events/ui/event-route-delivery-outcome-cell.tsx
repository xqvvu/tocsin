import { Link } from "@tanstack/react-router";

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
  eventId,
  routeId,
  routeName,
  matched,
  outcomes,
}: {
  eventId: string;
  routeId: string;
  routeName: string;
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
      {entries.map(({ state, count }) => {
        const stateLabel = t(`common.deliveryState.${state}`);
        // The count alone answers "how many"; the badge is the entry point to
        // "which rows". The route name belongs in the label because the same
        // state badge repeats once per route in this table, and a reader must be
        // able to tell the rows apart before following one.
        const linkTitle = `${stateLabel}: ${count} · ${routeName} · ${t(
          "events.detail.routeDeliveryOutcome.filterDeliveries",
        )}`;

        return (
          <Badge
            key={state}
            variant={
              state === "failed" ? "destructive" : state === "succeeded" ? "default" : "secondary"
            }
            className={
              state === "suppressed"
                ? "border-muted-foreground/40 text-muted-foreground"
                : undefined
            }
            render={
              <Link
                to="/deliveries"
                search={{ eventId, routeId, deliveryState: state }}
                aria-label={linkTitle}
              />
            }
            title={linkTitle}
          >
            {stateLabel} {count}
          </Badge>
        );
      })}
    </div>
  );
}
