import { Badge } from "#/components/ui/badge";
import type { Operations } from "#/features/operations/model/operation-types";
import { useTranslations } from "#/i18n/use-i18n";

type EventDeliveryCounts = Operations["events"]["items"][number]["deliveryCounts"];
type EventDeliveryState = keyof EventDeliveryCounts;

/**
 * Badge order, and the exhaustiveness guard for `deliveryCounts`.
 *
 * A `Record<EventDeliveryState, number>` refuses to compile when
 * `DeliveryState` gains a state that is not listed here, so a new state can
 * never be silently dropped from the total or from the badges.
 */
const DELIVERY_STATE_ORDER: Record<EventDeliveryState, number> = {
  failed: 0,
  running: 1,
  pending: 2,
  succeeded: 3,
  suppressed: 4,
};

const DELIVERY_STATES = (Object.keys(DELIVERY_STATE_ORDER) as EventDeliveryState[]).sort(
  (left, right) => DELIVERY_STATE_ORDER[left] - DELIVERY_STATE_ORDER[right],
);

export function EventDeliveryCountsCell({
  counts,
  routeMatchCount,
}: {
  counts: EventDeliveryCounts;
  routeMatchCount: number;
}) {
  const t = useTranslations();
  const total = DELIVERY_STATES.reduce((sum, state) => sum + counts[state], 0);

  if (total === 0 && routeMatchCount === 0) {
    return (
      <div className="flex justify-center">
        <Badge variant="outline" title={t("events.table.unmatchedRoutesTitle")}>
          {t("events.table.unmatchedRoutes")}
        </Badge>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="flex justify-center">
        <Badge variant="outline" className="min-w-8 justify-center font-mono tabular-nums">
          0
        </Badge>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-wrap justify-center gap-1">
      {DELIVERY_STATES.map((state) => (
        <EventDeliveryStateCount key={state} state={state} value={counts[state]} />
      ))}
    </div>
  );
}

function EventDeliveryStateCount({ state, value }: { state: EventDeliveryState; value: number }) {
  const t = useTranslations();

  if (value === 0) {
    return null;
  }

  return (
    <Badge
      variant={deliveryCountVariant(state)}
      title={`${t(`common.deliveryState.${state}`)}: ${value}`}
      className="min-w-12 justify-center gap-1 px-1.5"
    >
      {t(`common.deliveryState.${state}`)}
      <span className="self-baseline font-mono tabular-nums">{value}</span>
    </Badge>
  );
}

function deliveryCountVariant(
  state: EventDeliveryState,
): "default" | "secondary" | "destructive" | "outline" {
  return state === "failed" ? "destructive" : state === "succeeded" ? "default" : "outline";
}
