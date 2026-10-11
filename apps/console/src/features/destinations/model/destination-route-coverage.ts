import type { RouteDefinition } from "@tocsin/core";

type RouteSummary = RouteDefinition;

export interface DestinationRouteCoverage {
  enabledRouteCount: number;
  disabledRouteCount: number;
  routeNames: string[];
}

export function destinationRouteCoverage(
  destinationId: string,
  routes: RouteDefinition[],
): DestinationRouteCoverage {
  const referencingRoutes = routes.filter((route) =>
    routeReferencesDestination(route, destinationId),
  );
  const enabledRoutes = referencingRoutes.filter((route) => route.enabled);

  return {
    enabledRouteCount: enabledRoutes.length,
    disabledRouteCount: referencingRoutes.length - enabledRoutes.length,
    routeNames: enabledRoutes.map((route) => route.name),
  };
}

function routeReferencesDestination(route: RouteSummary, destinationId: string): boolean {
  return route.destinationIds.includes(destinationId);
}
