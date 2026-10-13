import { describe, expect, it } from "vite-plus/test";

import {
  DashboardOperationSearchSchema,
  mergeOperationSearch,
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
