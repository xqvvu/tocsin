import { Badge } from "#/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import { EventDetailSectionHeader } from "#/features/events/ui/event-detail-section-header";
import type { EventDetailData } from "#/features/events/ui/event-detail-types";
import { useTranslations } from "#/i18n/use-i18n";

export function EventDetailRouteMatchesTable({
  matches,
  matchedRouteCount,
  provenance,
}: {
  matches: EventDetailData["routeMatches"];
  matchedRouteCount: number;
  provenance: EventDetailData["routeMatchesProvenance"];
}) {
  const t = useTranslations();

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
              <TableHead className="w-[28%]">{t("events.detail.routeHeaders.route")}</TableHead>
              <TableHead className="w-[16%]">{t("events.detail.routeHeaders.result")}</TableHead>
              <TableHead className="w-[14%]">{t("events.detail.routeHeaders.targets")}</TableHead>
              <TableHead>{t("events.detail.routeHeaders.checks")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matches.length === 0 ? (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={4}>
                  {t("events.detail.empty.routes")}
                </TableCell>
              </TableRow>
            ) : (
              matches.map((match) => (
                <TableRow key={match.routeId} className="align-top">
                  <TableCell className="truncate font-medium" title={match.routeName}>
                    {match.routeName}
                  </TableCell>
                  <TableCell>
                    <MatchBadge matched={match.matched} />
                  </TableCell>
                  <TableCell>{match.destinationIds.length}</TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="flex min-w-0 flex-wrap gap-1">
                      {match.checks.map((check) => (
                        <RouteCheckBadge
                          key={`${match.routeId}-${check.field}-${check.detail}`}
                          check={check}
                        />
                      ))}
                    </div>
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

function MatchBadge({ matched }: { matched: boolean }) {
  const t = useTranslations();

  return (
    <Badge variant={matched ? "secondary" : "destructive"}>
      {matched ? t("events.detail.match.matched") : t("events.detail.match.missed")}
    </Badge>
  );
}

function RouteCheckBadge({
  check,
}: {
  check: EventDetailData["routeMatches"][number]["checks"][number];
}) {
  const t = useTranslations();

  return (
    <Badge
      variant={check.matched ? "outline" : "destructive"}
      className="max-w-full justify-start"
      title={check.detail}
    >
      <span className="font-medium">{t(`events.detail.routeCheckFields.${check.field}`)}</span>
      <span className="text-muted-foreground truncate">{describeRouteCheck(check, t)}</span>
    </Badge>
  );
}

/**
 * Render a check's evidence in the operator's language.
 *
 * `detail` is built in core as an English string, and for the label / title /
 * message conditions it only ever carried the rule's *expected* value — so
 * "why did this miss?" forced a trip to the normalized tab to find out what the
 * event actually said. Checks written before `condition` existed have no
 * structured form; those snapshots are immutable, so they fall back to the raw
 * detail rather than being rewritten.
 */
function describeRouteCheck(
  check: EventDetailData["routeMatches"][number]["checks"][number],
  t: ReturnType<typeof useTranslations>,
): string {
  const actual = check.actual;
  const enumerable =
    (check.field === "severity" || check.field === "status") && actual !== undefined;
  const expected =
    check.expected === undefined || check.expected.length === 0 ? undefined : check.expected;
  const localized = expected?.map((value) => {
    if (check.field === "severity") {
      return t(`common.severity.${value}`);
    }

    if (check.field === "status") {
      return t(`common.alertStatus.${value}`);
    }

    return value;
  });

  if (check.condition === "none") {
    return t("events.detail.routeCheck.none");
  }

  if (check.condition === "compare" && localized) {
    const wanted = localized.join(", ");

    if (check.field === "label") {
      return actual === undefined
        ? t("events.detail.routeCheck.labelMissing", { key: check.labelKey ?? "", value: wanted })
        : t("events.detail.routeCheck.label", {
            key: check.labelKey ?? "",
            value: wanted,
            actual,
          });
    }

    if (!enumerable) {
      return actual === undefined
        ? t("events.detail.routeCheck.expectedOnly", { value: wanted })
        : t("events.detail.routeCheck.contains", { value: wanted, actual });
    }

    return t("events.detail.routeCheck.received", { value: wanted, actual });
  }

  return check.detail;
}
