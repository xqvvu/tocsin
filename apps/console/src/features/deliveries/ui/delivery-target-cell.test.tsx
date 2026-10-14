// @vitest-environment jsdom

import { cleanup, render as renderRaw, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import larkIconUrl from "@tocsin/destinations/assets/destination-icons/lark.svg?url";

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
        destinationIconName="feishu"
        routeName="Critical alerts"
      />,
    );

    // The icon is what this change is about: a name-only cell would pass a
    // text assertion, so assert the image itself.
    const image = container.querySelector("img");
    expect(image, "no icon rendered in the target cell").not.toBeNull();
    expect(image!.getAttribute("src")).toBe(larkIconUrl);
    expect(image!.className).toContain("size-5");
    expect(image!.className).toContain("object-contain");

    const tile = image!.parentElement;
    expect(tile?.className).toContain("size-8");
    expect(tile?.className).toContain("items-center");
    expect(tile?.className).toContain("justify-center");
    expect(tile?.parentElement?.className).toContain("gap-3");
    expect(screen.getByText("SRE pager")).toBeTruthy();
  });

  it("renders an inline icon for email destinations", () => {
    const { container } = render(
      <DeliveryTargetCell
        destinationName="On-call inbox"
        destinationIconName="mail"
        routeName={null}
      />,
    );

    // Email has no asset file; its 16px glyph sits in the same centered 32px
    // tile as bundled 20px brand assets, matching the destination identity cell.
    expect(container.querySelector("img")).toBeNull();
    const glyph = container.querySelector("svg");
    expect(glyph).not.toBeNull();
    expect(glyph!.getAttribute("class")).toContain("size-4");
    expect(glyph!.parentElement?.className).toContain("size-8");
    expect(glyph!.parentElement?.className).toContain("items-center");
    expect(glyph!.parentElement?.className).toContain("justify-center");
  });

  it("falls back to a neutral glyph when the catalog does not know the kind", () => {
    const { container } = render(
      <DeliveryTargetCell
        destinationName="Legacy target"
        destinationIconName={null}
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

  it("renders a neutral glyph for a kind without an icon name", () => {
    // A kind can be registered and still declare no `iconName`; the cell shows
    // the icon's generic fallback, not the "unknown kind" treatment.
    const { container } = render(
      <DeliveryTargetCell
        destinationName="Icon-free target"
        destinationIconName={undefined}
        routeName={null}
      />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("shows the manual label when there is no route", () => {
    render(
      <DeliveryTargetCell
        destinationName="Direct send"
        destinationIconName="slack"
        routeName={null}
      />,
    );

    expect(screen.getByText("Manual")).toBeTruthy();
  });
});
