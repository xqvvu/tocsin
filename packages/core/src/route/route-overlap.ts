import { RouteDefinitionSchema } from "#core/route/route";
import type { LabelMatcher, RouteDefinitionInput, RouteRule } from "#core/route/route";

/**
 * Two enabled routes that can match the same event and deliver it to a shared
 * destination.
 *
 * The delivery dedupe key includes the route id, so two routes that both match
 * one alert each produce their own delivery to the same destination: the
 * on-call engineer is paged twice for one incident. The console uses this list
 * as a hint next to the route table — never as a save blocker, because overlapping
 * routes are a legitimate way to split ownership of a destination.
 */
export interface RouteOverlap {
  /** The two routes, in input order. */
  routeIds: [string, string];
  routeNames: [string, string];
  /** Destinations both routes deliver to, in the first route's own order. */
  sharedDestinationIds: string[];
}

/**
 * Every enabled route pair that can match the same event and shares at least
 * one destination, in input order.
 *
 * The check is deliberately conservative: an empty condition array matches
 * everything, `titleContains` / `messageContains` are substring requirements
 * that two titles can always satisfy together, and label matchers only prove a
 * pair apart when they contradict on the same key. A pair this function reports
 * therefore *can* overlap; a pair it omits provably cannot.
 */
export function findPotentialRouteOverlaps(routeInputs: RouteDefinitionInput[]): RouteOverlap[] {
  const routes = routeInputs
    .map((routeInput) => RouteDefinitionSchema.parse(routeInput))
    .filter((route) => route.enabled);
  const overlaps: RouteOverlap[] = [];

  for (let leftIndex = 0; leftIndex < routes.length; leftIndex += 1) {
    const left = routes[leftIndex];

    if (left === undefined) {
      continue;
    }

    for (let rightIndex = leftIndex + 1; rightIndex < routes.length; rightIndex += 1) {
      const right = routes[rightIndex];

      if (right === undefined) {
        continue;
      }

      const sharedDestinationIds = left.destinationIds.filter((destinationId) =>
        right.destinationIds.includes(destinationId),
      );

      if (sharedDestinationIds.length === 0 || !rulesCanOverlap(left.rule, right.rule)) {
        continue;
      }

      overlaps.push({
        routeIds: [left.id, right.id],
        routeNames: [left.name, right.name],
        sharedDestinationIds,
      });
    }
  }

  return overlaps;
}

/**
 * Whether two rules can be satisfied by one event. Every dimension is AND-ed
 * inside a rule, so the rules overlap when each dimension pair overlaps.
 */
function rulesCanOverlap(left: RouteRule, right: RouteRule): boolean {
  return (
    valuesCanOverlap(left.sourceIds, right.sourceIds) &&
    valuesCanOverlap(left.severities, right.severities) &&
    valuesCanOverlap(left.statuses, right.statuses) &&
    labelsCanOverlap(left.labels, right.labels)
  );
}

/** An empty array is a wildcard: it places no condition on this dimension. */
function valuesCanOverlap(left: string[], right: string[]): boolean {
  return left.length === 0 || right.length === 0 || left.some((value) => right.includes(value));
}

function labelsCanOverlap(left: LabelMatcher[], right: LabelMatcher[]): boolean {
  return !left.some((leftMatcher) =>
    right.some(
      (rightMatcher) =>
        leftMatcher.key === rightMatcher.key && labelMatchersConflict(leftMatcher, rightMatcher),
    ),
  );
}

/**
 * Two matchers on the same label key conflict only when no single label value
 * can satisfy both. `contains` demands are always jointly satisfiable (one
 * value can carry both substrings); equality conflicts with `contains` only
 * when the fixed value does not contain the required substring.
 */
function labelMatchersConflict(left: LabelMatcher, right: LabelMatcher): boolean {
  if (left.operator === "contains" && right.operator === "contains") {
    return false;
  }

  if (left.operator === "equals" && right.operator === "equals") {
    return left.value !== right.value;
  }

  const equalsMatcher = left.operator === "equals" ? left : right;
  const containsMatcher = left.operator === "equals" ? right : left;

  return !equalsMatcher.value.includes(containsMatcher.value);
}
