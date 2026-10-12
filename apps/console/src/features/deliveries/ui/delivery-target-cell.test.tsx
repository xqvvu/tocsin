// @vitest-environment jsdom

import { cleanup, render as renderRaw, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { DeliveryTargetCell } from "#/features/deliveries/ui/delivery-target-cell";
import { AppIntlProvider } from "#/i18n/provider";

// Real messages rather than a mock, so the "Manual" fallback is asserted
// against the string the app actually ships.
function render(ui: ReactNode) {
  return renderRaw(<AppIntlProvider locale="en-US">{ui}</AppIntlProvider>);
}

describe("delivery target cell", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the destination's brand icon, not just its name", () => {
    const { container } = render(
      <DeliveryTargetCell
        destinationName="SRE pager"
        destinationKind="feishu"
        routeName="Critical alerts"
      />,
    );

    // The icon is what this change is about: a name-only cell would pass a
    // text assertion, so assert the image itself.
    const image = container.querySelector("img");
    expect(image, "no icon rendered in the target cell").not.toBeNull();
    expect(image!.getAttribute("src")).toContain("lark");
    expect(screen.getByText("SRE pager")).toBeTruthy();
  });

  it("renders an inline icon for email destinations", () => {
    const { container } = render(
      <DeliveryTargetCell
        destinationName="On-call inbox"
        destinationKind="email"
        routeName={null}
      />,
    );

    // Email has no asset file; it renders a glyph instead of an <img>.
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("falls back to a neutral glyph when the kind is unknown", () => {
    const { container } = render(
      <DeliveryTargetCell
        destinationName="Legacy target"
        destinationKind={undefined}
        routeName={null}
      />,
    );

    // Rows read back from snapshots written before `destinationKind` existed
    // have no kind. An empty box would look broken; a wrong brand mark would be
    // misinformation, so the cell shows a question glyph.
    expect(container.querySelector("img")).toBeNull();
    const glyph = container.querySelector("svg");
    expect(glyph, "no fallback glyph rendered").not.toBeNull();
    expect(glyph!.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows the manual label when there is no route", () => {
    render(
      <DeliveryTargetCell destinationName="Direct send" destinationKind="slack" routeName={null} />,
    );

    expect(screen.getByText("Manual")).toBeTruthy();
  });
});
