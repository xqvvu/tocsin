import { pickBy } from "es-toolkit/object";
import { z } from "zod";

import type { Suppression, SuppressionKind, SuppressionState } from "@tocsin/core";
import { SuppressionKindSchema, SuppressionStateSchema, suppressionStateAt } from "@tocsin/core";

/**
 * The rule list is small enough to filter in the browser, so the URL carries
 * only the operator's intent and the derived state is never stored.
 */
export const SUPPRESSION_SEARCH_MAX_LENGTH = 100;

export const SuppressionListSearchSchema = z.object({
  // Derived from the window and `enabled` at read time, so an unknown value in
  // a hand-edited URL means "any state" instead of an error.
  state: z
    .union([SuppressionStateSchema, z.literal("")])
    .catch("")
    .optional(),
  kind: z
    .union([SuppressionKindSchema, z.literal("")])
    .catch("")
    .optional(),
  q: z.string().catch("").optional(),
});

export interface SuppressionListSearch {
  state?: SuppressionState | "";
  kind?: SuppressionKind | "";
  q?: string;
}

/**
 * Every filter the toolbar can write, cleared.
 *
 * The "clear all" button and each empty state's reset share this object so the
 * reset paths cannot drift apart.
 */
export const clearedSuppressionSearch: Readonly<SuppressionListSearch> = {
  state: "",
  kind: "",
  q: "",
};

/**
 * Whether the operator narrowed the list. An empty result means something
 * different when filters are on ("nothing matched") than when they are off
 * ("no rule has been created yet"), and the two empty states must say so.
 */
export function hasSuppressionFilters(search: SuppressionListSearch): boolean {
  return Boolean(search.state || search.kind || search.q?.trim());
}

export function pruneSuppressionSearch(search: SuppressionListSearch): SuppressionListSearch {
  return pickBy(
    {
      ...search,
      // A hand-edited URL bypasses the input's maxLength, so clip before the
      // value is persisted. Spacing is preserved: the input is backed by this
      // value and trimming on every keystroke eats the space in "Disk usage".
      q: search.q?.slice(0, SUPPRESSION_SEARCH_MAX_LENGTH),
    },
    (value) => typeof value === "string" && value.length > 0,
  ) as SuppressionListSearch;
}

export function mergeSuppressionSearch(
  search: SuppressionListSearch,
  next: Partial<SuppressionListSearch>,
): SuppressionListSearch {
  return pruneSuppressionSearch({ ...search, ...next });
}

export interface SuppressionSearchNames {
  /** Resolve a matcher id to the operator-visible name, when it still exists. */
  sourceName?: (sourceId: string) => string | undefined;
  destinationName?: (destinationId: string) => string | undefined;
}

/**
 * The list the table renders for the current URL state.
 *
 * Filtering happens before ordering: `sortSuppressionsForOperations` keeps the
 * operational priority (active first, expired last) whatever subset survives.
 * The matcher stores source and destination ids, so the name resolvers let an
 * operator find "the rule that silences Grafana" without knowing the id.
 */
export function filterSuppressions(
  suppressions: readonly Suppression[],
  search: SuppressionListSearch,
  now: string,
  names: SuppressionSearchNames = {},
): Suppression[] {
  const terms = searchTerms(search.q);
  const state = search.state || "";
  const kind = search.kind || "";

  return suppressions.filter((suppression) => {
    if (state && suppressionStateAt(suppression, now) !== state) {
      return false;
    }

    if (kind && suppression.kind !== kind) {
      return false;
    }

    if (terms.length === 0) {
      return true;
    }

    const haystack = suppressionHaystack(suppression, names);

    return terms.every((term) => haystack.includes(term));
  });
}

/**
 * Space-separated terms all have to match, mirroring the events and deliveries
 * search. Lowercased once per term; the haystack is lowercased once per row.
 */
function searchTerms(q: string | undefined): string[] {
  return (q ?? "")
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);
}

function suppressionHaystack(suppression: Suppression, names: SuppressionSearchNames): string {
  const { matcher } = suppression;
  const fields: string[] = [
    suppression.name,
    suppression.reason ?? "",
    suppression.kind,
    ...matcher.fingerprints,
    ...matcher.titleContains,
    ...matcher.messageContains,
    ...matcher.severities,
    ...matcher.statuses,
    ...matcher.sourceIds,
    ...matcher.destinationIds,
  ];

  for (const sourceId of matcher.sourceIds) {
    const name = names.sourceName?.(sourceId);

    if (name) {
      fields.push(name);
    }
  }

  for (const destinationId of matcher.destinationIds) {
    const name = names.destinationName?.(destinationId);

    if (name) {
      fields.push(name);
    }
  }

  for (const label of matcher.labels) {
    fields.push(label.key, label.value, `${label.key}=${label.value}`);
  }

  return fields.join("\n").toLocaleLowerCase();
}
