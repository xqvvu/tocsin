// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { FeishuAppIdentityCell } from "#/features/integrations/ui/feishu-app-identity-cell";
import { AppIntlProvider } from "#/i18n/provider";

/**
 * The name column used to render a bare `<span>`. These assertions are on the
 * rendered output rather than on the component being imported, because the
 * earlier failure mode on this page was exactly that distinction: a column can
 * import a real cell component and still show the wrong thing.
 */

const app = {
  id: "app-1",
  name: "SRE pager",
  appId: "cli_abcdef123456",
  updatedAt: "2026-10-13T00:00:00.000Z",
  referencedDestinations: [],
};

function renderCell() {
  return render(
    <AppIntlProvider locale="en-US">
      <FeishuAppIdentityCell app={app as never} />
    </AppIntlProvider>,
  );
}

describe("Feishu app identity cell", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders an icon alongside the name", () => {
    const { container } = renderCell();

    // A name-only cell would satisfy a text assertion, so assert the glyph.
    const icon = container.querySelector("svg");
    expect(icon, "no icon rendered next to the app name").not.toBeNull();
    expect(icon!.getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps the name readable", () => {
    const { container } = renderCell();

    expect(container.textContent).toContain("SRE pager");
    // The name must stay truncatable rather than wrapping the row taller.
    expect(container.querySelector(".truncate")?.textContent).toBe("SRE pager");
  });

  it("matches the tile shape the other list pages use", () => {
    const { container } = renderCell();

    // sources / destinations both wrap the glyph in a `size-8` bordered tile;
    // matching it is what makes the three tables read as one family.
    const tile = container.querySelector(".size-8");
    expect(tile, "icon is not wrapped in the shared tile").not.toBeNull();
    expect(tile!.className).toContain("shrink-0");
    expect(tile!.querySelector("svg")).not.toBeNull();
  });
});
