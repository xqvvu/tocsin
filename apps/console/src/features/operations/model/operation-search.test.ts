import { describe, expect, it } from "vite-plus/test";

import { OPERATION_SEARCH_MAX_LENGTH } from "@tocsin/core";

import {
  DashboardOperationSearchSchema,
  mergeOperationSearch,
  operationFiltersFromSearch,
  pruneSearch,
} from "#/features/operations/model/operation-search";

describe("delivery page in the operation search", () => {
  it("parses a page from the URL as a number", () => {
    // Search params arrive as strings; the route validates with this schema.
    expect(DashboardOperationSearchSchema.parse({ deliveryPage: "3" }).deliveryPage).toBe(3);
    // A garbage value falls back to page 1 rather than throwing at the router.
    expect(DashboardOperationSearchSchema.parse({ deliveryPage: "nope" }).deliveryPage).toBe(1);
  });

  it("keeps page 1 out of the URL", () => {
    // Page 1 is the default, so writing `=1` on every link is noise. This
    // mirrors how `eventPage` has always behaved.
    expect(pruneSearch({ deliveryPage: 1 }).deliveryPage).toBeUndefined();
    expect(pruneSearch({ deliveryPage: 2 }).deliveryPage).toBe(2);
    expect(pruneSearch({ eventPage: 1, deliveryPage: 1 }).deliveryPage).toBeUndefined();
  });

  it("resets both lists to their first page when a filter changes", () => {
    const merged = mergeOperationSearch({ eventPage: 4, deliveryPage: 3 }, { q: "checkout" });

    // A new result set means the old page numbers point somewhere else, so both
    // lists go back to the start.
    expect(merged.eventPage).toBeUndefined();
    expect(merged.deliveryPage).toBeUndefined();
  });

  it("keeps the page when only paging", () => {
    const merged = mergeOperationSearch({ deliveryPage: 2 }, { deliveryPage: 3 });

    // Paging is not filtering, so nothing resets.
    expect(merged.deliveryPage).toBe(3);
  });

  it("paging one list leaves the other list's page alone", () => {
    const merged = mergeOperationSearch({ eventPage: 3, deliveryPage: 2 }, { deliveryPage: 5 });

    expect(merged.deliveryPage).toBe(5);
    expect(merged.eventPage).toBe(3);
  });
});

describe("search text in the operation search", () => {
  it("keeps in-progress spacing in the URL", () => {
    // The search input is backed by this value. Trimming here would eat the
    // space in "Disk usage" while the operator is still typing.
    expect(pruneSearch({ q: "  Disk usage" }).q).toBe("  Disk usage");
  });

  it("trims the query only for the server filter", () => {
    expect(operationFiltersFromSearch({ q: "  Disk usage  " }).q).toBe("Disk usage");
    expect(operationFiltersFromSearch({ q: "   " }).q).toBeUndefined();
  });

  it("clips a hand-edited query to the contract limit", () => {
    // The input caps typing, but a pasted URL can be longer. Persisting the
    // overflow would make the next server call fail its schema validation.
    const long = "a".repeat(OPERATION_SEARCH_MAX_LENGTH + 20);

    const q = pruneSearch({ q: long }).q;

    expect(q).toHaveLength(OPERATION_SEARCH_MAX_LENGTH);
    expect(q).toBe("a".repeat(OPERATION_SEARCH_MAX_LENGTH));
  });
});

describe("route filter in the operation search", () => {
  it("keeps the route in the URL and resets both lists to the first page", () => {
    const merged = mergeOperationSearch({ eventPage: 4, deliveryPage: 3 }, { routeId: "route-1" });

    expect(merged.routeId).toBe("route-1");
    expect(merged.eventPage).toBeUndefined();
    expect(merged.deliveryPage).toBeUndefined();
  });

  it("keeps the route while paging", () => {
    const merged = mergeOperationSearch(
      { routeId: "route-1", deliveryPage: 2 },
      { deliveryPage: 3 },
    );

    expect(merged.routeId).toBe("route-1");
    expect(merged.deliveryPage).toBe(3);
  });

  it("drops an empty route from the URL", () => {
    expect(pruneSearch({ routeId: "" }).routeId).toBeUndefined();
  });
});

describe("time range in the operation search", () => {
  it("accepts every supported window and rejects an unknown one", () => {
    // The URL is user-editable; an unknown window must fall back to "all time"
    // instead of reaching the server as an unvalidated string.
    for (const range of ["15m", "1h", "6h", "24h", "7d"]) {
      expect(DashboardOperationSearchSchema.parse({ range }).range).toBe(range);
    }

    expect(DashboardOperationSearchSchema.parse({ range: "30d" }).range).toBe("");
  });

  it("keeps the default window out of the URL", () => {
    expect(pruneSearch({ range: "" }).range).toBeUndefined();
    expect(pruneSearch({ range: "1h" }).range).toBe("1h");
  });

  it("resets both lists to their first page when the window changes", () => {
    const merged = mergeOperationSearch(
      { eventPage: 4, deliveryPage: 3, range: "24h" },
      { range: "1h" },
    );

    expect(merged.range).toBe("1h");
    expect(merged.eventPage).toBeUndefined();
    expect(merged.deliveryPage).toBeUndefined();
  });

  it("keeps the window while paging", () => {
    const merged = mergeOperationSearch({ range: "1h", eventPage: 2 }, { eventPage: 3 });

    expect(merged.range).toBe("1h");
    expect(merged.eventPage).toBe(3);
  });
});
