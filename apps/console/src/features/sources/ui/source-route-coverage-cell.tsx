import { RiRouteLine } from "@remixicon/react";

import { Badge } from "#/components/ui/badge";
import type { SourceRouteCoverage } from "#/features/sources/model/source-route-coverage";
import { useTranslations } from "#/i18n/use-i18n";

export function SourceRouteCoverageCell({ coverage }: { coverage: SourceRouteCoverage }) {
  const t = useTranslations();
  const title = routeCoverageTitle(coverage, t);
  const variant =
    coverage.deliverableRouteCount > 0
      ? "secondary"
      : coverage.enabledRouteCount > 0
        ? "destructive"
        : "outline";

  return (
    <div className="flex min-w-0 justify-center">
      <Badge variant={variant} className="max-w-full font-mono text-[11px]" title={title}>
        <RiRouteLine data-icon="inline-start" aria-hidden />
        {coverageLabel(coverage, t)}
      </Badge>
    </div>
  );
}

function coverageLabel(
  coverage: SourceRouteCoverage,
  t: ReturnType<typeof useTranslations>,
): string {
  const base =
    coverage.deliverableRouteCount > 0
      ? coverage.blockedRouteCount > 0
        ? // Partial coverage used to look identical to full coverage unless
          // the operator hovered the badge; keep the blocked routes visible.
          t("sources.table.routes.partialDeliverable", {
            deliverable: coverage.deliverableRouteCount,
            total: coverage.enabledRouteCount,
          })
        : t("sources.table.routes.deliverable", {
            count: coverage.deliverableRouteCount,
          })
      : coverage.enabledRouteCount > 0
        ? t("sources.table.routes.blocked")
        : t("sources.table.routes.none");

  if (coverage.conditionalRouteCount === 0) {
    return base;
  }

  // A route that also requires a severity, status, label, or text condition
  // covers the source without covering all of its traffic. The bare count read
  // as "every alert from this source is delivered", so state the condition
  // next to it.
  return `${base}${t("sources.table.routes.conditionalSuffix", {
    count: coverage.conditionalRouteCount,
  })}`;
}

function routeCoverageTitle(
  coverage: SourceRouteCoverage,
  t: ReturnType<typeof useTranslations>,
): string {
  const base = routeCoverageBaseTitle(coverage, t);

  if (coverage.conditionalRouteCount === 0) {
    return base;
  }

  return `${base} ${t("sources.table.routes.conditionalTitle", {
    count: coverage.conditionalRouteCount,
    names: coverage.conditionalRouteNames.join(", "),
  })}`;
}

function routeCoverageBaseTitle(
  coverage: SourceRouteCoverage,
  t: ReturnType<typeof useTranslations>,
): string {
  if (coverage.enabledRouteCount === 0) {
    return t("sources.table.routes.noneTitle");
  }

  if (coverage.deliverableRouteCount === 0) {
    return t("sources.table.routes.blockedTitle", {
      count: coverage.enabledRouteCount,
      names: coverage.routeNames.join(", "),
    });
  }

  if (coverage.blockedRouteCount > 0) {
    return t("sources.table.routes.partialBlockedTitle", {
      count: coverage.enabledRouteCount,
      blocked: coverage.blockedRouteCount,
      blockedNames: coverage.blockedRouteNames.join(", "),
    });
  }

  return t("sources.table.routes.deliverableTitle", {
    count: coverage.deliverableRouteCount,
    direct: coverage.directRouteCount,
    catchAll: coverage.catchAllRouteCount,
    names: coverage.routeNames.join(", "),
  });
}
