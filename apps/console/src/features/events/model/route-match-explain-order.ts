import type { RouteMatchCheck, RouteMatchResult } from "@tocsin/core";

/**
 * Triage ordering for an event's route-match evidence.
 *
 * The server returns routes in storage order, which says nothing about why an
 * alert did or did not go out. Matched routes keep their recorded order on top
 * (they are what delivered); the unmatched ones follow, closest first — the
 * route that failed the fewest checks is the one the operator most likely
 * expected to fire.
 *
 * A snapshot written before structured checks existed carries no per-condition
 * evidence, so it is never claimed to be "close": it sorts after every route
 * with a known failure and never receives the closest-miss badge.
 */
export function orderRouteMatches(matches: RouteMatchResult[]): RouteMatchResult[] {
  const matched = matches.filter((match) => match.matched);
  const unmatched = matches.filter((match) => !match.matched).sort(compareMisses);

  return [...matched, ...unmatched];
}

export function missedCheckCount(checks: RouteMatchCheck[]): number {
  return checks.filter((check) => !check.matched).length;
}

export type ClosestRouteMiss = {
  routeId: string;
  missedChecks: number;
};

/**
 * The unmatched route worth calling "closest".
 *
 * Only answered when at least two routes missed: with a single unmatched route
 * there is nothing to compare it against, and its red check badges already say
 * everything the operator can know. Routes without structured checks are
 * excluded because "off by 0" would misread "no evidence" as "nearly matched".
 */
export function closestRouteMiss(matches: RouteMatchResult[]): ClosestRouteMiss | null {
  const unmatched = matches.filter((match) => !match.matched);

  if (unmatched.length < 2) {
    return null;
  }

  const [closest] = orderRouteMatches(unmatched);

  if (!closest) {
    return null;
  }

  const missedChecks = missedCheckCount(closest.checks);

  return missedChecks > 0 ? { routeId: closest.routeId, missedChecks } : null;
}

function compareMisses(left: RouteMatchResult, right: RouteMatchResult): number {
  const leftMissed = missedCheckCount(left.checks);
  const rightMissed = missedCheckCount(right.checks);
  const leftKnown = leftMissed > 0;
  const rightKnown = rightMissed > 0;

  if (leftKnown !== rightKnown) {
    return leftKnown ? -1 : 1;
  }

  if (leftKnown && rightKnown && leftMissed !== rightMissed) {
    return leftMissed - rightMissed;
  }

  return left.routeName.localeCompare(right.routeName) || left.routeId.localeCompare(right.routeId);
}
