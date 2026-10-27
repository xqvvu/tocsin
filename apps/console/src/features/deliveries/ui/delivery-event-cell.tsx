import { Link } from "@tanstack/react-router";

import { SeverityBadge } from "#/features/events/ui/severity-badge";
import type { Operations } from "#/features/operations/model/operation-types";
import { useTranslations } from "#/i18n/use-i18n";

export function DeliveryEventCell({
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
        {/* The title is the handle an operator recognises; keep it clickable so
            the delivery list can lead back to the alert it belongs to. */}
        <Link
          to="/events/$eventId"
          params={{ eventId }}
          className="truncate font-medium underline-offset-4 hover:underline"
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
