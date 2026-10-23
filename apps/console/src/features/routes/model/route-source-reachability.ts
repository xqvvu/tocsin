import type { RouteDefinition, SourceSummary } from "@tocsin/core";

export type RouteSourceReachability =
  | { kind: "reachable" }
  | { kind: "no-source" }
  | { kind: "all-disabled"; sourceCount: number };

type SourceState = Pick<SourceSummary, "id" | "enabled">;

/**
 * Reports whether an enabled route can still receive events.
 *
 * Route matching starts at the source: an empty `sourceIds` rule matches every
 * source, any other rule only the named ones. When every source the rule could
 * match is disabled, the route keeps its own enabled flag but can never fire —
 * the list would otherwise present it as healthy. Missing source ids count as
 * unmatched; deleting a source narrows or removes its routes.
 */
export function routeSourceReachability(
  rule: Pick<RouteDefinition["rule"], "sourceIds">,
  sources: readonly SourceState[],
): RouteSourceReachability {
  const matchedSources =
    rule.sourceIds.length === 0
      ? sources
      : sources.filter((source) => rule.sourceIds.includes(source.id));

  if (matchedSources.length === 0) {
    return { kind: "no-source" };
  }

  if (matchedSources.some((source) => source.enabled)) {
    return { kind: "reachable" };
  }

  return { kind: "all-disabled", sourceCount: matchedSources.length };
}
