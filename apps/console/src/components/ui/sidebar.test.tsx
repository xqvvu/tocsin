// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { Sidebar, SidebarProvider } from "#/components/ui/sidebar";

function stubMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
    }),
  });
}

function renderSidebar() {
  return render(
    <SidebarProvider>
      <Sidebar>
        <div>content</div>
      </Sidebar>
    </SidebarProvider>,
  );
}

function sidebarState(container: HTMLElement): string | null | undefined {
  return container.querySelector('[data-slot="sidebar"]')?.getAttribute("data-state");
}

describe("sidebar persisted state", () => {
  beforeEach(() => {
    stubMatchMedia();
    document.cookie = "sidebar_state=; path=/; max-age=0";
  });

  afterEach(() => {
    document.cookie = "sidebar_state=; path=/; max-age=0";
  });

  it("restores a collapsed sidebar from the cookie", async () => {
    document.cookie = "sidebar_state=false; path=/";

    const { container } = renderSidebar();

    await waitFor(() => expect(sidebarState(container)).toBe("collapsed"));
  });

  it("stays expanded when no state was persisted", () => {
    const { container } = renderSidebar();

    expect(sidebarState(container)).toBe("expanded");
  });
});
