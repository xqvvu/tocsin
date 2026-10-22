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

describe("destination kind filter in the operation search", () => {
  it("keeps the kind in the URL and resets both lists to the first page", () => {
    const merged = mergeOperationSearch(
      { eventPage: 4, deliveryPage: 3 },
      { destinationKind: "feishu" },
    );

    expect(merged.destinationKind).toBe("feishu");
    expect(merged.eventPage).toBeUndefined();
    expect(merged.deliveryPage).toBeUndefined();
  });

  it("falls back to all kinds instead of throwing on an unknown value", () => {
    // The URL is user-editable; an adapter kind removed from the registry must
    // not leave the deliveries page stuck on an invalid filter.
    expect(DashboardOperationSearchSchema.parse({ destinationKind: "pager" }).destinationKind).toBe(
      "",
    );
    expect(DashboardOperationSearchSchema.parse({ destinationKind: "email" }).destinationKind).toBe(
      "email",
    );
  });

  it("drops an empty kind from the URL and the server filter", () => {
    expect(pruneSearch({ destinationKind: "" }).destinationKind).toBeUndefined();
    expect(operationFiltersFromSearch({ destinationKind: "" }).destinationKind).toBeUndefined();
    expect(operationFiltersFromSearch({ destinationKind: "slack" }).destinationKind).toBe("slack");
  });
});

describe("minimum attempt count in the operation search", () => {
  it("parses the bound from the URL as a number", () => {
    // Search params arrive as strings; the route validates with this schema.
    expect(DashboardOperationSearchSchema.parse({ minAttempts: "2" }).minAttempts).toBe(2);
  });

  it("falls back to any attempt count on an invalid value", () => {
    // A hand-edited URL must not break the read path, and "less than one
    // attempt" describes nothing, so out-of-range input means "no bound".
    for (const value of ["abc", "0", "-1", "101"]) {
      expect(DashboardOperationSearchSchema.parse({ minAttempts: value }).minAttempts).toBe(0);
    }
  });

  it("keeps the sentinel out of the URL but sends a real bound", () => {
    expect(pruneSearch({ minAttempts: 0 }).minAttempts).toBeUndefined();
    expect(pruneSearch({ minAttempts: 2 }).minAttempts).toBe(2);
    expect(operationFiltersFromSearch({ minAttempts: 0 }).minAttempts).toBeUndefined();
    expect(operationFiltersFromSearch({ minAttempts: 2 }).minAttempts).toBe(2);
  });

  it("resets both lists to the first page when the bound changes", () => {
    const merged = mergeOperationSearch({ eventPage: 4, deliveryPage: 3 }, { minAttempts: 2 });

    expect(merged.minAttempts).toBe(2);
    expect(merged.eventPage).toBeUndefined();
    expect(merged.deliveryPage).toBeUndefined();
  });

  it("keeps the bound while paging", () => {
    const merged = mergeOperationSearch({ minAttempts: 2, deliveryPage: 2 }, { deliveryPage: 3 });

    expect(merged.minAttempts).toBe(2);
    expect(merged.deliveryPage).toBe(3);
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

describe("time range anchor in the operation search", () => {
  const anchor = "2026-10-23T04:00:00.000Z";

  it("pins the window to the anchor and keeps it in the URL", () => {
    const search = DashboardOperationSearchSchema.parse({ range: "1h", rangeAnchor: anchor });

    expect(search.rangeAnchor).toBe(anchor);
    expect(pruneSearch(search).rangeAnchor).toBe(anchor);
    expect(operationFiltersFromSearch(search).rangeAnchor).toBe(anchor);
  });

  it("falls back to a live window when the anchor is not a timestamp", () => {
    // The URL is user-editable; an unparseable anchor must not reach the
    // server, where it would fail contract validation and break the page.
    expect(
      DashboardOperationSearchSchema.parse({ range: "1h", rangeAnchor: "yesterday" }),
    ).toMatchObject({ range: "1h", rangeAnchor: "" });
  });

  it("keeps the anchor out of the URL when there is no window", () => {
    // An anchor alone describes nothing: without a range the server ignores it,
    // and carrying it forward would attach a stale instant to the next window.
    expect(pruneSearch({ rangeAnchor: anchor }).rangeAnchor).toBeUndefined();
  });

  it("drops a stale anchor when the window changes without a new one", () => {
    const merged = mergeOperationSearch({ range: "24h", rangeAnchor: anchor }, { range: "1h" });

    expect(merged.range).toBe("1h");
    expect(merged.rangeAnchor).toBeUndefined();
  });

  it("keeps the anchor while paging or changing another filter", () => {
    const paged = mergeOperationSearch(
      { range: "1h", rangeAnchor: anchor, eventPage: 2 },
      { eventPage: 3 },
    );
    expect(paged.rangeAnchor).toBe(anchor);

    const narrowed = mergeOperationSearch(
      { range: "1h", rangeAnchor: anchor },
      { severity: "critical" },
    );
    expect(narrowed.rangeAnchor).toBe(anchor);
  });

  it("replaces the anchor when the operator reopens the same window", () => {
    const reopened = mergeOperationSearch(
      { range: "1h", rangeAnchor: anchor },
      { range: "1h", rangeAnchor: "2026-10-23T05:00:00.000Z" },
    );

    expect(reopened.rangeAnchor).toBe("2026-10-23T05:00:00.000Z");
  });
});
