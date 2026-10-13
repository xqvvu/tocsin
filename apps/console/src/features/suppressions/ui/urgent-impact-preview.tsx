import { RiNotificationOffLine } from "@remixicon/react";

import type { DestinationListItem, SuppressionMatcher } from "@tocsin/core";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { urgentImpactPreview } from "#/features/suppressions/model/urgent-impact";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Consent panel for the blast radius of a suppression (PRD §2.3 / story 19).
 *
 * The copy is deliberately stronger than "no call will be placed": a suppressed
 * delivery never runs, so it never gets a `providerReference`, which means the
 * manual buzz button cannot reach it either. The operator is consenting to
 * "these targets cannot be woken by any Tocsin means", not just to "no
 * automatic page".
 */
export function UrgentImpactPreview({
  destinations,
  matcher,
}: {
  destinations: DestinationListItem[];
  matcher: SuppressionMatcher;
}) {
  const t = useTranslations();
  const preview = urgentImpactPreview(destinations, matcher);

  if (preview.destinations.length === 0) {
    return (
      <Alert>
        <RiNotificationOffLine aria-hidden />
        <AlertTitle>{t("suppressions.form.urgentImpact.noneTitle")}</AlertTitle>
        <AlertDescription>{t("suppressions.form.urgentImpact.noneDescription")}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <RiNotificationOffLine aria-hidden />
      <AlertTitle>
        {t("suppressions.form.urgentImpact.title", {
          count: preview.destinations.length,
        })}
      </AlertTitle>
      <AlertDescription>
        <p>
          {t("suppressions.form.urgentImpact.cannotWake", {
            count: preview.destinations.length,
          })}
        </p>
        <p className="mt-1">
          {t("suppressions.form.urgentImpact.destinations", {
            names: preview.destinations.map((destination) => destination.name).join(", "),
          })}
        </p>
      </AlertDescription>
    </Alert>
  );
}
