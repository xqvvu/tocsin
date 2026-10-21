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
        {coverage.deliverableRouteCount > 0
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
            : t("sources.table.routes.none")}
      </Badge>
    </div>
  );
}

function routeCoverageTitle(
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
