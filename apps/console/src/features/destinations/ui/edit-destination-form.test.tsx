// @vitest-environment jsdom

import { describe, expect, it } from "vite-plus/test";

import { editDestinationFormSectionClass } from "#/features/destinations/ui/edit-destination-form";

describe("edit destination form section", () => {
  // The dialog footer regression had two halves: the popup needed a definite
  // height, and this wrapper had to stay a flex consumer. A block wrapper made
  // the inner form grow to content height, which clipped the footer instead of
  // scrolling the body.
  it("makes the dialog wrapper a flex consumer", () => {
    const className = editDestinationFormSectionClass({ framed: false, layout: "dialog" });

    expect(className).toContain("flex-1");
    expect(className).toContain("min-h-0");
    expect(className).toContain("flex-col");
  });

  it("keeps the framed panel and inline layouts unchanged", () => {
    expect(editDestinationFormSectionClass({ framed: true, layout: "dialog" })).toContain("border");
    expect(editDestinationFormSectionClass({ framed: false, layout: "panel" })).toBeUndefined();
  });
});
