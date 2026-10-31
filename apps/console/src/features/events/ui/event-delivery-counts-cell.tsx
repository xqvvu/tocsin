import { Link } from "@tanstack/react-router";

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
  eventId,
  counts,
  routeMatchCount,
  expectedDeliveryCount,
}: {
  eventId: string;
  counts: EventDeliveryCounts;
  routeMatchCount: number;
  expectedDeliveryCount: number | null;
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
      <div className="flex flex-wrap justify-center gap-1">
        <Badge variant="outline" className="min-w-8 justify-center font-mono tabular-nums">
          0
        </Badge>
        <DeliveryGapBadge eventId={eventId} expected={expectedDeliveryCount} created={total} />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-wrap justify-center gap-1">
      {DELIVERY_STATES.map((state) => (
        <EventDeliveryStateCount
          key={state}
          eventId={eventId}
          state={state}
          value={counts[state]}
        />
      ))}
      <DeliveryGapBadge eventId={eventId} expected={expectedDeliveryCount} created={total} />
    </div>
  );
}

/**
 * The difference between what the intake snapshot promised and what exists.
 *
 * Counts alone cannot show this: three succeeded deliveries look complete until
 * the rules said four targets. The badge opens the event detail, whose route
 * gap table names the actual reason (dedupe, a disabled route or target, or an
 * already-deleted one) — this cell deliberately does not guess at it.
 */
function DeliveryGapBadge({
  eventId,
  expected,
  created,
}: {
  eventId: string;
  expected: number | null;
  created: number;
}) {
  const t = useTranslations();

  if (expected === null) {
    return null;
  }

  const missing = expected - created;

  if (missing <= 0) {
    return null;
  }

  const title = t("events.table.deliveryGapTitle", { expected, created });

  return (
    <Badge
      variant="outline"
      className="min-w-12 justify-center gap-1 px-1.5"
      render={<Link to="/events/$eventId" params={{ eventId }} aria-label={title} title={title} />}
    >
      {t("events.table.deliveryGap", { count: missing })}
    </Badge>
  );
}

function EventDeliveryStateCount({
  eventId,
  state,
  value,
}: {
  eventId: string;
  state: EventDeliveryState;
  value: number;
}) {
  const t = useTranslations();

  if (value === 0) {
    return null;
  }

  const stateLabel = t(`common.deliveryState.${state}`);
  // The badge is the entry point to this event's fan-out: clicking it opens the
  // delivery list already narrowed to this event and this state, so on-call can
  // go from "3 failed" to the three rows without copying the event id.
  const linkTitle = `${stateLabel}: ${value} · ${t("events.table.filterDeliveriesByEvent")}`;

  return (
    <Badge
      variant={deliveryCountVariant(state)}
      render={
        <Link to="/deliveries" search={{ eventId, deliveryState: state }} aria-label={linkTitle} />
      }
      title={linkTitle}
      className="min-w-12 justify-center gap-1 px-1.5"
    >
      {stateLabel}
      <span className="self-baseline font-mono tabular-nums">{value}</span>
    </Badge>
  );
}

function deliveryCountVariant(
  state: EventDeliveryState,
): "default" | "secondary" | "destructive" | "outline" {
  return state === "failed" ? "destructive" : state === "succeeded" ? "default" : "outline";
}
