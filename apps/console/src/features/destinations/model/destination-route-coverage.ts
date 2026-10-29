import { routeRuleHasEventConditions } from "@tocsin/core";
import type { RouteDefinition, SourceSummary } from "@tocsin/core";

type RouteSummary = RouteDefinition;
type SourceStatus = Pick<SourceSummary, "id" | "enabled">;

export interface DestinationRouteCoverage {
  enabledRouteCount: number;
  /**
   * Enabled routes that can actually receive an alert for this destination:
   * at least one alert source they match is enabled. A route whose matching
   * sources are all disabled never produces a delivery, however enabled it is.
   */
  reachableRouteCount: number;
  /** Enabled routes whose matching sources are all disabled or missing. */
  blockedRouteCount: number;
  disabledRouteCount: number;
  /**
   * Reachable routes that only deliver when the event also matches a rule
   * condition (severity, status, label, or text). They cover the destination,
   * but not all of the traffic routed to it.
   */
  conditionalRouteCount: number;
  routeNames: string[];
  blockedRouteNames: string[];
  conditionalRouteNames: string[];
}

/**
 * Answers whether the enabled routes pointed at a destination can still fire.
 *
 * Route-level enabling is only half of the path: an enabled route whose
 * source condition names disabled sources never sees an event, and a
 * catch-all route sees none when every source is off. Counting those as
 * coverage made the destination column read "N 条生效" on a link that can
 * never deliver. `sourceIds` is a routing condition, not an event condition,
 * so reachability is derived here rather than through
 * `routeRuleHasEventConditions`.
 */
export function destinationRouteCoverage(
  destinationId: string,
  routes: RouteDefinition[],
  sources: readonly SourceStatus[],
): DestinationRouteCoverage {
  const enabledSourceIds = new Set(
    sources.filter((source) => source.enabled).map((source) => source.id),
  );
  const referencingRoutes = routes.filter((route) =>
    routeReferencesDestination(route, destinationId),
  );
  const enabledRoutes = referencingRoutes.filter((route) => route.enabled);
  const reachableRoutes: RouteSummary[] = [];
  const blockedRoutes: RouteSummary[] = [];

  for (const route of enabledRoutes) {
    if (routeHasEnabledSource(route, enabledSourceIds)) {
      reachableRoutes.push(route);
    } else {
      blockedRoutes.push(route);
    }
  }

  const conditionalRoutes = reachableRoutes.filter((route) =>
    routeRuleHasEventConditions(route.rule),
  );

  return {
    enabledRouteCount: enabledRoutes.length,
    reachableRouteCount: reachableRoutes.length,
    blockedRouteCount: blockedRoutes.length,
    disabledRouteCount: referencingRoutes.length - enabledRoutes.length,
    conditionalRouteCount: conditionalRoutes.length,
    routeNames: enabledRoutes.map((route) => route.name),
    blockedRouteNames: blockedRoutes.map((route) => route.name),
    conditionalRouteNames: conditionalRoutes.map((route) => route.name),
  };
}

function routeReferencesDestination(route: RouteSummary, destinationId: string): boolean {
  return route.destinationIds.includes(destinationId);
}

function routeHasEnabledSource(route: RouteSummary, enabledSourceIds: Set<string>): boolean {
  // No source condition means every source matches, including ones created
  // later, so at least one source has to be enabled for the route to fire.
  if (route.rule.sourceIds.length === 0) {
    return enabledSourceIds.size > 0;
  }

  return route.rule.sourceIds.some((sourceId) => enabledSourceIds.has(sourceId));
}
