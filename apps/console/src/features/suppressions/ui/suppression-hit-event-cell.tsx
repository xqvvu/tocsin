import { Link } from "@tanstack/react-router";

import { SeverityBadge } from "#/features/events/ui/severity-badge";
import type { Operations } from "#/features/operations/model/operation-types";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Event identity for a silenced delivery.
 *
 * Mirrors the delivery list's event cell so an operator reviewing a
 * maintenance window can tell which alert was silenced without opening every
 * event. The title links to the event detail; the identifier stays visible for
 * correlation with upstream systems.
 */
export function SuppressionHitEventCell({
  eventId,
  eventTitle,
  eventSeverity,
  eventStatus,
  sourceName,
}: {
  eventId: string;
  eventTitle: string;
  eventSeverity: Operations["deliveries"]["items"][number]["eventSeverity"];
  eventStatus: Operations["deliveries"]["items"][number]["eventStatus"];
  sourceName: string;
}) {
  const t = useTranslations();

  return (
    <div className="min-w-0">
      <div className="mb-1 flex min-w-0 items-center gap-1.5">
        <SeverityBadge severity={eventSeverity} />
        <Link
          to="/events/$eventId"
          params={{ eventId }}
          className="truncate font-medium hover:underline"
          title={eventTitle}
        >
          {eventTitle}
        </Link>
      </div>
      <div className="text-muted-foreground flex min-w-0 items-center gap-1 text-[11px]">
        <span className="truncate" title={sourceName}>
          {sourceName}
        </span>
        <span aria-hidden="true">·</span>
        <span
          className={
            eventStatus === "firing" ? "text-destructive shrink-0 font-medium" : "shrink-0"
          }
        >
          {t(`common.alertStatus.${eventStatus}`)}
        </span>
        <span aria-hidden="true">·</span>
        <span className="truncate font-mono" title={eventId}>
          {eventId}
        </span>
      </div>
    </div>
  );
}
