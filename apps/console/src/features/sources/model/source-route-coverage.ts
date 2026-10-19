import type { DestinationSummary, RouteDefinition } from "@tocsin/core";

type RouteSummary = RouteDefinition;
type DestinationStatus = Pick<DestinationSummary, "id" | "enabled">;

export interface SourceRouteCoverage {
  /** Enabled routes that match the source, regardless of destination state. */
  enabledRouteCount: number;
  /** Matching routes with at least one enabled destination, so delivery can proceed. */
  deliverableRouteCount: number;
  /** Matching routes whose destinations are all disabled or missing. */
  blockedRouteCount: number;
  directRouteCount: number;
  catchAllRouteCount: number;
  routeNames: string[];
  blockedRouteNames: string[];
}

export function sourceRouteCoverage(
  sourceId: string,
  routes: RouteDefinition[],
  destinations: DestinationStatus[],
): SourceRouteCoverage {
  const enabledRoutes = routes.filter(
    (route) => route.enabled && routeCoversSource(route, sourceId),
  );
  const enabledDestinationIds = new Set(
    destinations.filter((destination) => destination.enabled).map((destination) => destination.id),
  );
  const deliverableRoutes: RouteSummary[] = [];
  const blockedRoutes: RouteSummary[] = [];

  for (const route of enabledRoutes) {
    if (route.destinationIds.some((id) => enabledDestinationIds.has(id))) {
      deliverableRoutes.push(route);
    } else {
      blockedRoutes.push(route);
    }
  }

  return {
    enabledRouteCount: enabledRoutes.length,
    deliverableRouteCount: deliverableRoutes.length,
    blockedRouteCount: blockedRoutes.length,
    directRouteCount: enabledRoutes.filter((route) => route.rule.sourceIds.includes(sourceId))
      .length,
    catchAllRouteCount: enabledRoutes.filter((route) => route.rule.sourceIds.length === 0).length,
    routeNames: enabledRoutes.map((route) => route.name),
    blockedRouteNames: blockedRoutes.map((route) => route.name),
  };
}

function routeCoversSource(route: RouteSummary, sourceId: string): boolean {
  return route.rule.sourceIds.length === 0 || route.rule.sourceIds.includes(sourceId);
}
