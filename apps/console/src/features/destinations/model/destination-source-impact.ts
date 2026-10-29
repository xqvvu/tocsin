import type { RouteDefinition, SourceSummary } from "@tocsin/core";

type SourceSummaryShape = Pick<SourceSummary, "id" | "name" | "enabled">;

export interface DestinationSourceImpact {
  /** Distinct enabled alert sources whose alerts currently reach the destination. */
  affectedSourceCount: number;
  affectedSourceNames: string[];
  /**
   * An affected route matches every source (`rule.sourceIds = []`), so the
   * affected set is every source, including ones created later. The names list
   * can only show what exists today, so callers should say "all sources"
   * instead of enumerating.
   */
  coversAllSources: boolean;
}

/**
 * Answers the question a disable or delete confirmation has to answer before
 * the operator commits: which alert sources lose this delivery path.
 *
 * A route aggregates sources (`rule.sourceIds`) and an empty list matches every
 * source, so the route count already shown in those dialogs cannot be converted
 * into sources by the reader. Only enabled routes deliver today and only
 * enabled sources produce alerts, so both are filtered out here.
 */
export function destinationSourceImpact(
  destinationId: string,
  routes: RouteDefinition[],
  sources: readonly SourceSummaryShape[],
): DestinationSourceImpact {
  const affectedRoutes = routes.filter(
    (route) => route.enabled && route.destinationIds.includes(destinationId),
  );
  const coversAllSources = affectedRoutes.some((route) => route.rule.sourceIds.length === 0);
  const referencedSourceIds = new Set(affectedRoutes.flatMap((route) => route.rule.sourceIds));
  const affectedSources = sources.filter(
    (source) => source.enabled && (coversAllSources || referencedSourceIds.has(source.id)),
  );

  return {
    affectedSourceCount: affectedSources.length,
    affectedSourceNames: affectedSources.map((source) => source.name),
    coversAllSources,
  };
}
