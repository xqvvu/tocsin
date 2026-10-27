import { RiAlertLine } from "@remixicon/react";

import type { DestinationSummary, RouteOverlap } from "@tocsin/core";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * How many overlapping pairs the notice spells out before it summarizes the
 * rest. The list is a warning, not a report: the table badge still marks every
 * affected route, so an operator with many overlaps is not left guessing.
 */
const listedOverlapLimit = 3;

export function RouteOverlapNotice({
  overlaps,
  destinations,
}: {
  overlaps: RouteOverlap[];
  destinations: DestinationSummary[];
}) {
  const t = useTranslations();

  if (overlaps.length === 0) {
    return null;
  }

  const destinationNameForId = (destinationId: string) =>
    destinations.find((destination) => destination.id === destinationId)?.name ?? destinationId;
  const listed = overlaps.slice(0, listedOverlapLimit);
  const hiddenCount = overlaps.length - listed.length;

  return (
    <Alert>
      <RiAlertLine aria-hidden />
      <AlertTitle>{t("routing.overlap.title")}</AlertTitle>
      <AlertDescription>
        <p>{t("routing.overlap.description")}</p>
        <ul className="mt-1 space-y-0.5">
          {listed.map((overlap) => (
            <li key={overlap.routeIds.join(":")}>
              {t("routing.overlap.pair", {
                routeName: overlap.routeNames[0],
                otherRouteName: overlap.routeNames[1],
                destinationNames: overlap.sharedDestinationIds
                  .map(destinationNameForId)
                  .join(t("routing.overlap.nameSeparator")),
              })}
            </li>
          ))}
        </ul>
        {hiddenCount > 0 ? <p>{t("routing.overlap.more", { count: hiddenCount })}</p> : null}
      </AlertDescription>
    </Alert>
  );
}
