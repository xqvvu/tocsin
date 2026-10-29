import { RiRouteLine } from "@remixicon/react";

import { Badge } from "#/components/ui/badge";
import type { DestinationRouteCoverage } from "#/features/destinations/model/destination-route-coverage";
import { useTranslations } from "#/i18n/use-i18n";

export function DestinationRouteCoverageCell({ coverage }: { coverage: DestinationRouteCoverage }) {
  const t = useTranslations();
  const title = routeCoverageTitle(coverage, t);
  const variant =
    coverage.reachableRouteCount > 0
      ? "secondary"
      : coverage.enabledRouteCount > 0
        ? "destructive"
        : "outline";

  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <Badge variant={variant} className="max-w-full font-mono text-[11px]" title={title}>
        <RiRouteLine data-icon="inline-start" aria-hidden />
        {coverageLabel(coverage, t)}
      </Badge>
      {coverage.conditionalRouteCount > 0 ? (
        // A route that also requires a severity, status, label, or text
        // condition reaches this destination only for matching traffic, and
        // the bare count reads as "everything routed here is delivered". The
        // count used to be appended to the badge, but the combined label
        // ("2 reachable · 1 conditional") is wider than the Routing column at
        // 1280 and was clipped mid-word, hiding both numbers; a second line
        // keeps each fact readable inside the same column.
        <span className="text-muted-foreground text-[10px] leading-tight">
          {t("destinations.table.routes.conditionalCount", {
            count: coverage.conditionalRouteCount,
          })}
        </span>
      ) : null}
    </div>
  );
}

function coverageLabel(
  coverage: DestinationRouteCoverage,
  t: ReturnType<typeof useTranslations>,
): string {
  return coverage.reachableRouteCount > 0
    ? coverage.blockedRouteCount > 0
      ? // Partial coverage used to look identical to full coverage unless
        // the operator hovered the badge; keep the blocked routes visible.
        t("destinations.table.routes.partialReachable", {
          reachable: coverage.reachableRouteCount,
          total: coverage.enabledRouteCount,
        })
      : t("destinations.table.routes.reachable", {
          count: coverage.reachableRouteCount,
        })
    : coverage.enabledRouteCount > 0
      ? t("destinations.table.routes.blocked")
      : t("destinations.table.routes.none");
}

function routeCoverageTitle(
  coverage: DestinationRouteCoverage,
  t: ReturnType<typeof useTranslations>,
): string {
  const base = routeCoverageBaseTitle(coverage, t);

  if (coverage.conditionalRouteCount === 0) {
    return base;
  }

  return `${base} ${t("destinations.table.routes.conditionalTitle", {
    count: coverage.conditionalRouteCount,
    names: coverage.conditionalRouteNames.join(", "),
  })}`;
}

function routeCoverageBaseTitle(
  coverage: DestinationRouteCoverage,
  t: ReturnType<typeof useTranslations>,
): string {
  if (coverage.enabledRouteCount === 0) {
    return coverage.disabledRouteCount > 0
      ? t("destinations.table.routes.disabledOnlyTitle", {
          count: coverage.disabledRouteCount,
        })
      : t("destinations.table.routes.noneTitle");
  }

  if (coverage.reachableRouteCount === 0) {
    return t("destinations.table.routes.blockedTitle", {
      count: coverage.enabledRouteCount,
      names: coverage.routeNames.join(", "),
    });
  }

  if (coverage.blockedRouteCount > 0) {
    return t("destinations.table.routes.partialBlockedTitle", {
      count: coverage.enabledRouteCount,
      blocked: coverage.blockedRouteCount,
      blockedNames: coverage.blockedRouteNames.join(", "),
    });
  }

  return t("destinations.table.routes.reachableTitle", {
    count: coverage.reachableRouteCount,
    disabled: coverage.disabledRouteCount,
    names: coverage.routeNames.join(", "),
  });
}
