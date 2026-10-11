import type { RouteDefinition } from "@tocsin/core";

type RouteSummary = RouteDefinition;

export interface SourceRouteCoverage {
  enabledRouteCount: number;
  directRouteCount: number;
  catchAllRouteCount: number;
  routeNames: string[];
}

export function sourceRouteCoverage(
  sourceId: string,
  routes: RouteDefinition[],
): SourceRouteCoverage {
  const enabledRoutes = routes.filter(
    (route) => route.enabled && routeCoversSource(route, sourceId),
  );

  return {
    enabledRouteCount: enabledRoutes.length,
    directRouteCount: enabledRoutes.filter((route) => route.rule.sourceIds.includes(sourceId))
      .length,
    catchAllRouteCount: enabledRoutes.filter((route) => route.rule.sourceIds.length === 0).length,
    routeNames: enabledRoutes.map((route) => route.name),
  };
}

function routeCoversSource(route: RouteSummary, sourceId: string): boolean {
  return route.rule.sourceIds.length === 0 || route.rule.sourceIds.includes(sourceId);
}
