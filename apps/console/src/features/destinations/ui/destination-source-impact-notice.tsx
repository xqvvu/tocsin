import { RiRadarLine } from "@remixicon/react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import type { DestinationSourceImpact } from "#/features/destinations/model/destination-source-impact";
import { useTranslations } from "#/i18n/use-i18n";

/** Names shown before the list collapses into "and N more". */
const visibleSourceNameLimit = 5;

/**
 * Read-only disclosure for the disable and delete confirmations: which alert
 * sources lose this delivery path. The route count already in those dialogs
 * cannot be read as a source count, because one route can aggregate several
 * sources.
 *
 * Renders nothing when no enabled source is affected, so the dialog does not
 * add a "0 sources" row next to the route impact it already shows.
 */
export function DestinationSourceImpactNotice({ impact }: { impact: DestinationSourceImpact }) {
  const t = useTranslations();

  if (impact.affectedSourceCount === 0) {
    return null;
  }

  const visibleNames = impact.affectedSourceNames.slice(0, visibleSourceNameLimit);
  const hiddenSourceCount = impact.affectedSourceCount - visibleNames.length;
  const names = visibleNames.join(t("destinations.sourceImpact.nameSeparator"));

  return (
    <Alert>
      <RiRadarLine aria-hidden />
      <AlertTitle>
        {t("destinations.sourceImpact.title", { count: impact.affectedSourceCount })}
      </AlertTitle>
      <AlertDescription>
        {impact.coversAllSources
          ? t("destinations.sourceImpact.allSources")
          : hiddenSourceCount > 0
            ? t("destinations.sourceImpact.descriptionMore", {
                names,
                count: hiddenSourceCount,
              })
            : t("destinations.sourceImpact.description", { names })}
      </AlertDescription>
    </Alert>
  );
}
