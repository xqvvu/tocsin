import { routeRuleHasEventConditions } from "@tocsin/core";
import type { RouteDefinition } from "@tocsin/core";

type RouteSummary = RouteDefinition;

export interface DestinationRouteCoverage {
  enabledRouteCount: number;
  disabledRouteCount: number;
  /**
   * Enabled routes that only deliver to this destination when the event also
   * matches a rule condition (severity, status, label, or text). They cover the
   * destination, but not all of the traffic routed to it.
   */
  conditionalRouteCount: number;
  routeNames: string[];
  conditionalRouteNames: string[];
}

export function destinationRouteCoverage(
  destinationId: string,
  routes: RouteDefinition[],
): DestinationRouteCoverage {
  const referencingRoutes = routes.filter((route) =>
    routeReferencesDestination(route, destinationId),
  );
  const enabledRoutes = referencingRoutes.filter((route) => route.enabled);
  const conditionalRoutes = enabledRoutes.filter((route) =>
    routeRuleHasEventConditions(route.rule),
  );

  return {
    enabledRouteCount: enabledRoutes.length,
    disabledRouteCount: referencingRoutes.length - enabledRoutes.length,
    conditionalRouteCount: conditionalRoutes.length,
    routeNames: enabledRoutes.map((route) => route.name),
    conditionalRouteNames: conditionalRoutes.map((route) => route.name),
  };
}

function routeReferencesDestination(route: RouteSummary, destinationId: string): boolean {
  return route.destinationIds.includes(destinationId);
}
