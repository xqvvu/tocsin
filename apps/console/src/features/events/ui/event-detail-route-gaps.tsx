import { Link } from "@tanstack/react-router";

import { Badge } from "#/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import type { EventDetailData } from "#/features/events/ui/event-detail-types";
import { useTranslations } from "#/i18n/use-i18n";

type RouteMatchGap = EventDetailData["routeMatchGaps"][number];

/**
 * Why routes that matched produced nothing.
 *
 * The reason text is the whole point of this table, so the cases are kept
 * visibly distinct rather than collapsed into one "not delivered" label:
 * a deleted route, a disabled target and an expired dedupe row are three
 * different stories, and only two of them are actionable.
 *
 * `unknown` is rendered as plainly as the rest — an honest "we cannot tell"
 * is more trustworthy than a confident wrong answer, and the reason enum
 * exists so that case can never masquerade as a known one.
 */
export function EventDetailRouteGaps({ gaps }: { gaps: EventDetailData["routeMatchGaps"] }) {
  const t = useTranslations();

  if (gaps.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium" data-route-gaps={gaps.length}>
        {t("events.detail.routeGapsTitle")}
      </h3>
      <div className="border-border bg-background overflow-auto border">
        <Table className="min-w-140">
          <TableHeader className="bg-muted/50 text-muted-foreground">
            <TableRow>
              <TableHead className="w-[22%]">{t("events.detail.routeGapsRoute")}</TableHead>
              <TableHead className="w-[22%]">{t("events.detail.routeGapsDestination")}</TableHead>
              <TableHead>{t("events.detail.routeGapsReason")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {gaps.map((gap) => (
              <TableRow
                key={`${gap.routeId}:${gap.destinationId ?? "*"}`}
                className="align-top"
                data-gap-reason={gap.reason}
              >
                <TableCell className="truncate" title={gap.routeName}>
                  {gap.routeName}
                </TableCell>
                <TableCell className="truncate">
                  {gap.destinationId === null ? (
                    // Route-level reason: every target this route selected is
                    // missing a delivery, so naming one would imply the others
                    // were fine.
                    <span className="text-muted-foreground">
                      {t("events.detail.routeGapsAllTargets")}
                    </span>
                  ) : (
                    (gap.destinationName ?? <MissingDestination id={gap.destinationId} />)
                  )}
                </TableCell>
                <TableCell className="text-xs">
                  <GapReason gap={gap} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function GapReason({ gap }: { gap: RouteMatchGap }) {
  const t = useTranslations();

  switch (gap.reason) {
    case "duplicate_within_window": {
      // Only this reason can name the event that won — and only while the
      // dedupe row still exists. The winner is linked because the whole point
      // of naming it is to let the operator open the delivery that did happen.
      const firstEventId = gap.firstEventId;

      if (!firstEventId) {
        return <span>{t("events.detail.routeGaps.reason.unknown")}</span>;
      }

      return (
        <span>
          {t.rich("events.detail.routeGaps.reason.duplicate_within_window", {
            eventId: firstEventId,
            event: (chunks) => (
              <Link
                to="/events/$eventId"
                params={{ eventId: firstEventId }}
                className="font-mono underline underline-offset-2 hover:no-underline"
              >
                {chunks}
              </Link>
            ),
          })}
        </span>
      );
    }
    case "unknown":
      return (
        <span className="text-muted-foreground">{t("events.detail.routeGaps.reason.unknown")}</span>
      );
    default:
      return <span>{t(`events.detail.routeGaps.reason.${gap.reason}`)}</span>;
  }
}

/**
 * A destination that no longer exists has no name to show. Saying so beats an
 * empty cell, which reads as a rendering bug rather than a deleted resource.
 */
function MissingDestination({ id }: { id: string }) {
  const t = useTranslations();

  return (
    <span className="text-muted-foreground inline-flex items-center gap-1">
      <Badge variant="outline" className="text-[10px]">
        {t("events.detail.routeGaps.reason.destination_missing")}
      </Badge>
      <span className="truncate" title={id}>
        {id}
      </span>
    </span>
  );
}
