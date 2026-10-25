import { describe, expect, it } from "vite-plus/test";

import { OPERATION_SEARCH_MAX_TERMS, splitOperationSearchTerms } from "#core/operations";

describe("splitOperationSearchTerms", () => {
  it("collapses whitespace and drops empty terms", () => {
    expect(splitOperationSearchTerms("  disk   prod \n node ")).toEqual({
      terms: ["disk", "prod", "node"],
      ignoredCount: 0,
    });
  });

  it("returns no terms for a blank query", () => {
    expect(splitOperationSearchTerms("   ")).toEqual({ terms: [], ignoredCount: 0 });
  });

  it("applies every term up to the cap", () => {
    const terms = Array.from({ length: OPERATION_SEARCH_MAX_TERMS }, (_, index) => `t${index}`);
    const result = splitOperationSearchTerms(terms.join(" "));

    expect(result.terms).toEqual(terms);
    expect(result.ignoredCount).toBe(0);
  });

  it("reports the trailing terms a pasted query loses", () => {
    const applied = Array.from({ length: OPERATION_SEARCH_MAX_TERMS }, (_, index) => `t${index}`);
    const result = splitOperationSearchTerms([...applied, "ignored-a", "ignored-b"].join(" "));

    // The terms that survive are exactly the leading ones, so the console can
    // tell the operator the visible list is broader than the query.
    expect(result.terms).toEqual(applied);
    expect(result.ignoredCount).toBe(2);
  });
});
