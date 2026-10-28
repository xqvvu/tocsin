import { describe, expect, it } from "vite-plus/test";

import { EVENT_FINGERPRINT_FILTER_MAX_LENGTH, OPERATION_SEARCH_MAX_LENGTH } from "@tocsin/core";

import {
  clearedOperationSearch,
  DashboardOperationSearchSchema,
  hasOperationFilters,
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

describe("destination filter in the operation search", () => {
  it("only keeps the destination match next to a destination", () => {
    // `destinationMatch` describes how events relate to the selected target;
    // without one it would be a filter that silently does nothing, so it never
    // reaches the URL on its own.
    expect(pruneSearch({ destinationMatch: "missing" }).destinationMatch).toBeUndefined();
    expect(
      pruneSearch({ destinationId: "destination-1", destinationMatch: "missing" }).destinationMatch,
    ).toBe("missing");

    // Clearing the destination drops the match with it for the same reason.
    const cleared = mergeOperationSearch(
      { destinationId: "destination-1", destinationMatch: "missing" },
      { destinationId: "" },
    );

    expect(cleared.destinationMatch).toBeUndefined();
  });

  it("keeps the default match out of the URL", () => {
    // `delivered` is what the server applies when the key is absent, so writing
    // it on every link would only make the URL longer.
    expect(
      pruneSearch({ destinationId: "destination-1", destinationMatch: "delivered" })
        .destinationMatch,
    ).toBeUndefined();
  });

  it("resets both lists when the destination match changes", () => {
    const merged = mergeOperationSearch(
      { eventPage: 4, deliveryPage: 3, destinationId: "destination-1" },
      { destinationMatch: "missing" },
    );

    expect(merged.destinationMatch).toBe("missing");
    expect(merged.eventPage).toBeUndefined();
    expect(merged.deliveryPage).toBeUndefined();
  });

  it("falls back to any match instead of throwing on an unknown value", () => {
    // The URL is user-editable; an unknown value must mean "no extra filter"
    // rather than an error at the router.
    expect(
      DashboardOperationSearchSchema.parse({ destinationMatch: "sent" }).destinationMatch,
    ).toBe("");
    expect(
      DashboardOperationSearchSchema.parse({ destinationMatch: "missing" }).destinationMatch,
    ).toBe("missing");
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

describe("delivery outcome filter in the operation search", () => {
  it("accepts every delivery state plus the no-delivery outcome", () => {
    // `none` is the only value that is not a DeliveryState: it is how a
    // silently dropped alert ("no route matched") becomes findable.
    for (const outcome of ["none", "pending", "running", "succeeded", "failed", "suppressed"]) {
      expect(
        DashboardOperationSearchSchema.parse({ deliveryOutcome: outcome }).deliveryOutcome,
      ).toBe(outcome);
    }
  });

  it("falls back to no filter for a hand-edited unknown value", () => {
    expect(
      DashboardOperationSearchSchema.parse({ deliveryOutcome: "bounced" }).deliveryOutcome,
    ).toBe("");
  });

  it("keeps the outcome out of the URL when it is cleared", () => {
    expect(pruneSearch({ deliveryOutcome: "" }).deliveryOutcome).toBeUndefined();
    expect(pruneSearch({ deliveryOutcome: "none" }).deliveryOutcome).toBe("none");
    expect(operationFiltersFromSearch({ deliveryOutcome: "none" }).deliveryOutcome).toBe("none");
  });

  it("counts as an active filter so the empty state can explain itself", () => {
    // Without this the table would say "nothing has happened yet" while the
    // outcome filter is hiding every event.
    expect(hasOperationFilters({ deliveryOutcome: "none" })).toBe(true);
    expect(hasOperationFilters({})).toBe(false);
  });

  it("resets both lists to their first page when the outcome changes", () => {
    const merged = mergeOperationSearch(
      { eventPage: 4, deliveryPage: 3 },
      { deliveryOutcome: "failed" },
    );

    expect(merged.deliveryOutcome).toBe("failed");
    expect(merged.eventPage).toBeUndefined();
    expect(merged.deliveryPage).toBeUndefined();
  });
});

describe("delivery receipt filter in the operation search", () => {
  it("parses the receipt state from the URL and falls back on garbage", () => {
    expect(DashboardOperationSearchSchema.parse({ receipt: "present" }).receipt).toBe("present");
    expect(DashboardOperationSearchSchema.parse({ receipt: "missing" }).receipt).toBe("missing");
    // A hand-edited URL must not break the deliveries page.
    expect(DashboardOperationSearchSchema.parse({ receipt: "maybe" }).receipt).toBe("");
  });

  it("keeps the receipt out of the URL when cleared but sends a real value", () => {
    expect(pruneSearch({ receipt: "" }).receipt).toBeUndefined();
    expect(pruneSearch({ receipt: "present" }).receipt).toBe("present");
    expect(operationFiltersFromSearch({ receipt: "" }).receipt).toBeUndefined();
    expect(operationFiltersFromSearch({ receipt: "missing" }).receipt).toBe("missing");
  });

  it("counts as an active filter so the empty state can explain itself", () => {
    expect(hasOperationFilters({ receipt: "missing" })).toBe(true);
  });

  it("resets both lists to their first page when the receipt changes", () => {
    const merged = mergeOperationSearch({ eventPage: 4, deliveryPage: 3 }, { receipt: "present" });

    expect(merged.receipt).toBe("present");
    expect(merged.eventPage).toBeUndefined();
    expect(merged.deliveryPage).toBeUndefined();
  });
});

describe("delivery time basis in the operation search", () => {
  it("falls back to enqueue time instead of throwing on an unknown value", () => {
    // The URL is user-editable; a stale link must not leave the list stuck.
    expect(DashboardOperationSearchSchema.parse({ timeField: "sent" }).timeField).toBe("");
    expect(DashboardOperationSearchSchema.parse({ timeField: "updated" }).timeField).toBe(
      "updated",
    );
  });

  it("keeps last activity out of the URL when it is the default", () => {
    expect(pruneSearch({ timeField: "" }).timeField).toBeUndefined();
    expect(pruneSearch({ timeField: "updated" }).timeField).toBe("updated");
  });

  it("treats enqueue time written by hand as the default, not an active filter", () => {
    // `created` narrows nothing: the default basis already selects the same
    // rows. Counting it as an active filter made a hand-edited
    // `timeField=created` claim "nothing matched" and leave a phantom chip.
    expect(hasOperationFilters({ timeField: "created" })).toBe(false);
    expect(hasOperationFilters({ timeField: "" })).toBe(false);
    expect(pruneSearch({ timeField: "created" }).timeField).toBeUndefined();
  });

  it("passes the basis to the server filter and counts it as an active filter", () => {
    expect(operationFiltersFromSearch({ timeField: "updated" }).timeField).toBe("updated");
    expect(hasOperationFilters({ timeField: "updated" })).toBe(true);
  });

  it("resets both lists to their first page when the basis changes", () => {
    const merged = mergeOperationSearch(
      { eventPage: 4, deliveryPage: 3 },
      { timeField: "updated" },
    );

    expect(merged.timeField).toBe("updated");
    expect(merged.eventPage).toBeUndefined();
    expect(merged.deliveryPage).toBeUndefined();
  });
});

describe("clearing the operation search", () => {
  it("clears every filter the toolbar can write", () => {
    // One shared list feeds the inline reset and both page-level resets. If a
    // new filter is added without a clear value here, "Reset filters" leaves it
    // applied — exactly what happened to `minAttempts` on the deliveries page.
    expect(Object.keys(clearedOperationSearch).sort()).toEqual([
      "deliveryOutcome",
      "deliveryState",
      "destinationId",
      "destinationKind",
      "destinationMatch",
      "eventId",
      "fingerprint",
      "minAttempts",
      "q",
      "range",
      "rangeAnchor",
      "receipt",
      "routeId",
      "severity",
      "sourceId",
      "status",
      "timeField",
    ]);
    expect(hasOperationFilters(clearedOperationSearch)).toBe(false);
    // Nothing survives pruning, so the cleared state leaves a clean URL.
    expect(pruneSearch(clearedOperationSearch)).toEqual({});
  });
});

describe("event filter in the operation search", () => {
  it("keeps a linked event id and treats it as an active filter", () => {
    const search = DashboardOperationSearchSchema.parse({
      eventId: "evt-1",
      deliveryState: "failed",
    });

    expect(search.eventId).toBe("evt-1");
    // The deliveries empty state says "nothing matched" only when it can see an
    // active filter; an uncounted event id would make it claim nobody filtered.
    expect(hasOperationFilters(search)).toBe(true);
    expect(operationFiltersFromSearch(search)).toMatchObject({
      eventId: "evt-1",
      deliveryState: "failed",
    });
  });

  it("falls back to no event filter for an empty value", () => {
    expect(DashboardOperationSearchSchema.parse({ eventId: "" }).eventId).toBe("");
    expect(hasOperationFilters({ eventId: "" })).toBe(false);
    expect(pruneSearch({ eventId: "" }).eventId).toBeUndefined();
  });

  it("returns both lists to page 1 when the event filter changes", () => {
    const merged = mergeOperationSearch({ eventPage: 4, deliveryPage: 3 }, { eventId: "evt-1" });

    expect(merged.eventId).toBe("evt-1");
    expect(merged.eventPage).toBeUndefined();
    expect(merged.deliveryPage).toBeUndefined();
  });
});

describe("exact fingerprint filter in the operation search", () => {
  it("trims a pasted fingerprint for the server and drops an empty one", () => {
    // Fingerprints are pasted exact identifiers, so unlike the search box the
    // URL never needs to keep in-progress spacing.
    expect(pruneSearch({ fingerprint: "  checkout:unavailable  " }).fingerprint).toBe(
      "checkout:unavailable",
    );
    expect(pruneSearch({ fingerprint: "   " }).fingerprint).toBeUndefined();
    expect(operationFiltersFromSearch({ fingerprint: " checkout:unavailable " })).toMatchObject({
      fingerprint: "checkout:unavailable",
    });
  });

  it("clips a hand-edited fingerprint to the contract limit", () => {
    const long = "f".repeat(EVENT_FINGERPRINT_FILTER_MAX_LENGTH + 20);

    const fingerprint = pruneSearch({ fingerprint: long }).fingerprint;

    // Persisting the overflow would make the next server call fail validation,
    // which is the same reason the search term is clipped.
    expect(fingerprint).toHaveLength(EVENT_FINGERPRINT_FILTER_MAX_LENGTH);
  });

  it("counts as an active filter and resets both lists to the first page", () => {
    expect(hasOperationFilters({ fingerprint: "checkout:unavailable" })).toBe(true);
    expect(hasOperationFilters({ fingerprint: "" })).toBe(false);

    const merged = mergeOperationSearch(
      { eventPage: 4, deliveryPage: 3 },
      { fingerprint: "checkout:unavailable" },
    );

    expect(merged.fingerprint).toBe("checkout:unavailable");
    expect(merged.eventPage).toBeUndefined();
    expect(merged.deliveryPage).toBeUndefined();
  });

  it("clears with the shared reset object", () => {
    // The events page reset and the inline chip share one reset table; a key
    // missing here would survive "Reset filters" exactly like `minAttempts`
    // once did on the deliveries page.
    expect(clearedOperationSearch.fingerprint).toBe("");
  });
});
