import { RiFilter3Line } from "@remixicon/react";
import * as React from "react";

import type { SourceSummary, SuppressionMatcher } from "@tocsin/core";

import { suppressionScopeSummary } from "#/features/suppressions/model/suppression-scope";
import { useTranslations } from "#/i18n/use-i18n";

const listSeparator = ", ";

/**
 * Discloses which alerts a suppression matches before the operator saves it.
 *
 * PRD §2.3 asks the console to show the hit source / severity / status range
 * next to the destination blast radius. The destination half lives in
 * `UrgentImpactPreview`; this panel covers the alert-side dimensions that the
 * destination preview deliberately cannot narrow on.
 */
export function SuppressionScopePreview({
  sources,
  matcher,
}: {
  sources: SourceSummary[];
  matcher: SuppressionMatcher;
}) {
  const t = useTranslations();
  const headingId = React.useId();
  const scope = suppressionScopeSummary(sources, matcher);

  const sourceText =
    scope.sources.length === 0
      ? t("suppressions.form.scope.allSources")
      : scope.sources
          .map((source) => {
            if (source.name === null) {
              return t("suppressions.form.scope.sourceDeleted", { id: source.id });
            }
            return source.enabled
              ? source.name
              : t("suppressions.form.scope.sourceDisabled", { name: source.name });
          })
          .join(listSeparator);

  const severityText =
    scope.severities.length === 0
      ? t("suppressions.form.scope.allSeverities")
      : scope.severities.map((severity) => t(`common.severity.${severity}`)).join(listSeparator);

  const statusText =
    scope.statuses.length === 0
      ? t("suppressions.form.scope.allStatuses")
      : scope.statuses.map((status) => t(`common.alertStatus.${status}`)).join(listSeparator);

  return (
    <section aria-labelledby={headingId} className="border-border bg-muted/30 border p-3">
      <h3 id={headingId} className="flex items-center gap-2 text-xs font-semibold">
        <RiFilter3Line className="size-3.5" aria-hidden />
        {t("suppressions.form.scope.title")}
      </h3>
      <p className="text-muted-foreground mt-1 text-xs">
        {t("suppressions.form.scope.description")}
      </p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">{t("suppressions.form.scope.sourcesLabel")}</dt>
        <dd>{sourceText}</dd>
        <dt className="text-muted-foreground">{t("suppressions.form.scope.severitiesLabel")}</dt>
        <dd>{severityText}</dd>
        <dt className="text-muted-foreground">{t("suppressions.form.scope.statusesLabel")}</dt>
        <dd>{statusText}</dd>
      </dl>
      {scope.hasTextConditions ? (
        <p className="text-muted-foreground mt-2 text-xs">
          {t("suppressions.form.scope.textConditions")}
        </p>
      ) : null}
    </section>
  );
}
