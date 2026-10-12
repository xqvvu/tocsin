// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createDefaultDestinationRegistry } from "@tocsin/destinations";
import larkIconUrl from "@tocsin/destinations/assets/destination-icons/lark.svg?url";
import slackIconUrl from "@tocsin/destinations/assets/destination-icons/slack.svg?url";
import telegramIconUrl from "@tocsin/destinations/assets/destination-icons/telegram.svg?url";
import webhookIconUrl from "@tocsin/destinations/assets/destination-icons/webhook.svg?url";

import { DestinationKindIcon } from "#/features/destinations/ui/destination-kind-icon";

describe("destination kind icon", () => {
  afterEach(() => {
    cleanup();
  });

  it.each([
    ["feishu", larkIconUrl],
    ["slack", slackIconUrl],
    ["webhook", webhookIconUrl],
  ])("resolves the %s icon name to its bundled asset", (iconName, assetUrl) => {
    // The icon comes from the manifest-declared name, not from a switch on the
    // destination kind: `feishu` deliberately resolves to the Lark asset.
    const { container } = render(<DestinationKindIcon iconName={iconName} />);
    const image = container.querySelector("img");

    expect(image?.getAttribute("src")).toBe(assetUrl);
    expect(image?.getAttribute("aria-hidden")).toBe("true");
  });

  it("resolves an icon name no shipped adapter uses yet", () => {
    // This is the contract a contributor relies on: declaring an existing icon
    // name in a manifest must not require touching a console file.
    const { container } = render(<DestinationKindIcon iconName="telegram" />);

    expect(container.querySelector("img")?.getAttribute("src")).toBe(telegramIconUrl);
  });

  it("renders the inline mail glyph the email manifest points at", () => {
    const { container } = render(<DestinationKindIcon iconName="mail" />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it.each([["discord"], [undefined]])(
    "falls back to a neutral glyph for an unresolvable icon name (%s)",
    (iconName) => {
      const { container } = render(<DestinationKindIcon iconName={iconName} />);

      // A new adapter must never produce a crash or a silently blank cell.
      expect(container.querySelector("img")).toBeNull();
      const glyph = container.querySelector("svg");
      expect(glyph, "no fallback glyph rendered").not.toBeNull();
      expect(glyph?.getAttribute("aria-hidden")).toBe("true");
    },
  );

  it("renders something for every icon name in the default catalog", () => {
    for (const item of createDefaultDestinationRegistry().toCatalog()) {
      const { container } = render(<DestinationKindIcon iconName={item.iconName} />);

      expect(
        container.querySelector("img, svg"),
        `${item.kind} (iconName ${item.iconName ?? "<missing>"}) rendered nothing`,
      ).not.toBeNull();
      cleanup();
    }
  });
});
