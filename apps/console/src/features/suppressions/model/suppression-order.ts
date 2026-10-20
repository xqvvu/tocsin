import { suppressionStateAt, type Suppression, type SuppressionState } from "@tocsin/core";

/**
 * Operational priority of a suppression's lifecycle state.
 *
 * `active` rules are the only ones silencing alerts right now, so they belong
 * above everything else. `scheduled` rules are next: they will silence alerts
 * soon and are easy to forget. `disabled` rules were switched off by an
 * operator and may be waiting to be re-enabled; `expired` rules are already
 * self-healing and belong at the bottom.
 */
const stateRank: Record<SuppressionState, number> = {
  active: 0,
  scheduled: 1,
  disabled: 2,
  expired: 3,
};

interface RankedSuppression {
  suppression: Suppression;
  state: SuppressionState;
}

/**
 * Orders suppressions for the operations list.
 *
 * The repository returns `created_at desc`, which is right for an immutable
 * audit trail but wrong for an on-call screen: a newly created expired rule
 * would push the rule that is actually silencing alerts off the first page.
 * The decision record expects the list itself to prevent forgotten
 * suppressions (`docs/prd/alert-suppression-decisions.md:74`), so ordering is a
 * fixed operational priority rather than a user preference.
 */
export function sortSuppressionsForOperations(
  suppressions: readonly Suppression[],
  now: string,
): Suppression[] {
  return suppressions
    .map((suppression) => ({ suppression, state: suppressionStateAt(suppression, now) }))
    .sort(compareRankedSuppressions)
    .map(({ suppression }) => suppression);
}

function compareRankedSuppressions(left: RankedSuppression, right: RankedSuppression): number {
  const rank = stateRank[left.state] - stateRank[right.state];

  if (rank !== 0) {
    return rank;
  }

  const lifecycle = compareLifecycle(left, right);

  if (lifecycle !== 0) {
    return lifecycle;
  }

  // Mirror the repository's stable ordering so rows that tie on state keep a
  // familiar "newest first" order instead of shuffling between renders.
  return (
    compareInstants(right.suppression.createdAt, left.suppression.createdAt) ||
    right.suppression.id.localeCompare(left.suppression.id)
  );
}

function compareLifecycle(left: RankedSuppression, right: RankedSuppression): number {
  // The states are equal here, so switching on either one is enough.
  switch (left.state) {
    case "active":
      // The soonest expiry is the one most likely to surprise an operator:
      // the rule will stop silencing without anyone touching it.
      return compareInstants(left.suppression.endsAt, right.suppression.endsAt);
    case "scheduled":
      return compareInstants(left.suppression.startsAt, right.suppression.startsAt);
    case "disabled":
      return compareInstants(right.suppression.updatedAt, left.suppression.updatedAt);
    case "expired":
      return compareInstants(right.suppression.endsAt, left.suppression.endsAt);
  }
}

/**
 * Compares two stored timestamps as instants.
 *
 * The API accepts zoned timestamps, so lexical ordering is only a fallback for
 * rows a hand-edited database may contain. `suppressionStateAt` applies the
 * same principle when deriving the state.
 */
function compareInstants(left: string, right: string): number {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);

  if (Number.isNaN(leftMs) || Number.isNaN(rightMs)) {
    return left < right ? -1 : left > right ? 1 : 0;
  }

  return leftMs - rightMs;
}
