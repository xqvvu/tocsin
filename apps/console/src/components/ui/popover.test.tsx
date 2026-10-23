// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";

describe("popover", () => {
  afterEach(() => {
    cleanup();
  });

  it("caps its height to the space next to the anchor and scrolls inside", () => {
    render(
      <Popover defaultOpen>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>Panel</PopoverContent>
      </Popover>,
    );

    const content = document.querySelector('[data-slot="popover-content"]');

    // A phone-height filter panel is taller than the viewport. Base UI exposes
    // the height available next to the anchor; a popover that ignores it runs
    // off the screen along with the controls the operator opened it for.
    expect(content?.className).toContain("max-h-(--available-height)");
    expect(content?.className).toContain("overflow-y-auto");
  });
});
