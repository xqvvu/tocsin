import type { RouteDefinition } from "@tocsin/core";

type RouteSummary = RouteDefinition;

export interface RouteReferenceImpact {
  /** Referencing routes that keep matching another source or destination. */
  narrowedRouteCount: number;
  /** Referencing routes whose only source or destination is the removed entity. */
  deletedRouteCount: number;
  deletedRouteNames: string[];
}

/**
 * Mirrors the repository cleanup a source or destination delete performs:
 * a route survives when it still has another source (or destination), and is
 * deleted when the removed entity was its last one.
 */
export function routeReferenceImpact(
  routes: RouteDefinition[],
  selectReferenceIds: (route: RouteSummary) => readonly string[],
  entityId: string,
): RouteReferenceImpact {
  let narrowedRouteCount = 0;
  const deletedRouteNames: string[] = [];

  for (const route of routes) {
    const referenceIds = selectReferenceIds(route);
    if (!referenceIds.includes(entityId)) {
      continue;
    }

    if (referenceIds.length === 1) {
      deletedRouteNames.push(route.name);
    } else {
      narrowedRouteCount += 1;
    }
  }

  return {
    narrowedRouteCount,
    deletedRouteCount: deletedRouteNames.length,
    deletedRouteNames,
  };
}
