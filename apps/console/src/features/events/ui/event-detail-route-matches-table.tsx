import { Badge } from "#/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import {
  closestRouteMiss,
  orderRouteMatches,
} from "#/features/events/model/route-match-explain-order";
import { routeDeliveryOutcomes } from "#/features/events/ui/event-detail-route-delivery-outcomes";
import { EventDetailSectionHeader } from "#/features/events/ui/event-detail-section-header";
import type { EventDetailData } from "#/features/events/ui/event-detail-types";
import { RouteDeliveryOutcomeCell } from "#/features/events/ui/event-route-delivery-outcome-cell";
import { RouteMatchCheckBadges } from "#/features/routes/ui/route-match-check-badges";
import { RouteMatchResultBadge } from "#/features/routes/ui/route-match-result-badge";
import { useTranslations } from "#/i18n/use-i18n";

export function EventDetailRouteMatchesTable({
  eventId,
  matches,
  matchedRouteCount,
  provenance,
  deliveries,
}: {
  eventId: string;
  matches: EventDetailData["routeMatches"];
  matchedRouteCount: number;
  provenance: EventDetailData["routeMatchesProvenance"];
  deliveries: EventDetailData["deliveries"];
}) {
  const t = useTranslations();
  const outcomes = routeDeliveryOutcomes(deliveries);
  // Storage order is not triage order: when several routes missed, the one that
  // failed the fewest checks is the rule the operator probably meant to write.
  const orderedMatches = orderRouteMatches(matches);
  const closest = closestRouteMiss(matches);

  return (
    <section className="flex h-full min-h-0 flex-col gap-2">
      <EventDetailSectionHeader
        title={t("events.detail.routeMatchesTitle")}
        meta={t("events.detail.summary.routeMatches", {
          matched: matchedRouteCount,
          total: matches.length,
        })}
      />
      {/*
        Provenance is not decoration: an intake snapshot is immutable evidence of
        what the rules said at the time, while a recomputed result reflects the
        rules as they are now. Rendering them identically hid that distinction.
      */}
      <p className="text-muted-foreground text-xs" data-provenance={provenance}>
        {provenance === "intake_snapshot"
          ? t("events.detail.routeMatchesProvenance.snapshot")
          : t("events.detail.routeMatchesProvenance.recomputed")}
      </p>
      <div className="border-border bg-background min-h-0 flex-1 overflow-auto border">
        <Table className="min-w-180 table-fixed">
          <TableHeader className="bg-muted/50 text-muted-foreground sticky top-0 z-10">
            <TableRow>
              <TableHead className="w-[24%]">{t("events.detail.routeHeaders.route")}</TableHead>
              <TableHead className="w-[14%]">{t("events.detail.routeHeaders.result")}</TableHead>
              <TableHead className="w-[12%]">{t("events.detail.routeHeaders.targets")}</TableHead>
              <TableHead className="w-[22%]">
                {t("events.detail.routeHeaders.deliveries")}
              </TableHead>
              <TableHead>{t("events.detail.routeHeaders.checks")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matches.length === 0 ? (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={5}>
                  {t("events.detail.empty.routes")}
                </TableCell>
              </TableRow>
            ) : (
              orderedMatches.map((match) => (
                <TableRow key={match.routeId} className="align-top">
                  <TableCell className="truncate font-medium" title={match.routeName}>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">{match.routeName}</span>
                      {closest?.routeId === match.routeId ? (
                        <Badge variant="secondary" className="shrink-0">
                          {t("events.detail.routeMatchesClosest", {
                            count: closest.missedChecks,
                          })}
                        </Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell>
                    <RouteMatchResultBadge matched={match.matched} />
                  </TableCell>
                  <TableCell>{match.destinationIds.length}</TableCell>
                  <TableCell className="whitespace-normal">
                    <RouteDeliveryOutcomeCell
                      eventId={eventId}
                      routeId={match.routeId}
                      routeName={match.routeName}
                      matched={match.matched}
                      outcomes={outcomes.get(match.routeId)}
                    />
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <RouteMatchCheckBadges checks={match.checks} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
