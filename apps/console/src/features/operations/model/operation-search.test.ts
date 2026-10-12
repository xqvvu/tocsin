import { describe, expect, it } from "vite-plus/test";

import {
  decodeCursorTrail,
  encodeCursorTrail,
  mergeOperationSearch,
} from "#/features/operations/model/operation-search";

const cursor = (time: string, id: string) =>
  `${encodeURIComponent(time)}|${encodeURIComponent(id)}`;

describe("delivery cursor trail", () => {
  it("round-trips a trail, including the cursorless first page", () => {
    const first = cursor("2026-10-12T10:00:00.000Z", "delivery-1");
    const second = cursor("2026-10-12T09:00:00.000Z", "delivery-2");

    for (const trail of [[""], ["", first], ["", first, second]]) {
      expect(decodeCursorTrail(encodeCursorTrail(trail))).toEqual(trail);
    }
  });

  it("treats a missing or malformed trail as being on the first page", () => {
    // A hand-edited or truncated URL must not produce a bogus history.
    expect(decodeCursorTrail(undefined)).toEqual([""]);
    expect(decodeCursorTrail("")).toEqual([""]);
    expect(decodeCursorTrail("not-a-cursor")).toEqual([""]);
  });

  it("keeps the first page out of the URL when it is the only entry", () => {
    // `=start` would be noise on every first visit.
    expect(encodeCursorTrail([""])).toBe("");
    expect(encodeCursorTrail([])).toBe("");
  });

  it("reports whether a previous page exists", () => {
    const first = cursor("2026-10-12T10:00:00.000Z", "delivery-1");
    const second = cursor("2026-10-12T09:00:00.000Z", "delivery-2");

    // `canPrevious` is `length > 1`: page 1 has nowhere to go back to.
    expect(decodeCursorTrail(encodeCursorTrail([""])).length > 1).toBe(false);
    expect(decodeCursorTrail(encodeCursorTrail(["", first])).length > 1).toBe(true);
    expect(decodeCursorTrail(encodeCursorTrail(["", first, second])).length > 1).toBe(true);
  });

  it("drops the trail when a filter changes", () => {
    const first = cursor("2026-10-12T10:00:00.000Z", "delivery-1");
    const filtered = mergeOperationSearch(
      { deliveryCursor: first, deliveryCursorTrail: encodeCursorTrail(["", first]) },
      { q: "checkout" },
    );

    // A new result set has no history. Keeping the trail would show a
    // "Previous" button on what is now the first page.
    // Both keys are pruned from the URL entirely, which is how "first page"
    // is spelled — an absent trail decodes to the cursorless page 1.
    expect(filtered.deliveryCursor).toBeUndefined();
    expect(filtered.deliveryCursorTrail).toBeUndefined();
    expect(decodeCursorTrail(filtered.deliveryCursorTrail)).toEqual([""]);
  });

  it("keeps the trail when only the page cursor changes", () => {
    const first = cursor("2026-10-12T10:00:00.000Z", "delivery-1");
    const trail = encodeCursorTrail(["", first]);
    const next = mergeOperationSearch(
      { deliveryCursor: first, deliveryCursorTrail: trail },
      { deliveryCursor: "deeper" },
    );

    // Paging is not filtering, so the history must survive.
    expect(next.deliveryCursorTrail).toBe(trail);
  });
});
