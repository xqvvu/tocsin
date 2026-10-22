// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  Sidebar,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarProvider,
} from "#/components/ui/sidebar";

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

describe("sidebar collapsed group labels", () => {
  beforeEach(() => {
    stubMatchMedia();
  });

  it("does not intercept pointer events over the previous group", () => {
    const { container } = render(
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarGroup>
            <SidebarGroupLabel>Operations</SidebarGroupLabel>
            <SidebarGroupContent>
              <a href="/events">Events</a>
            </SidebarGroupContent>
          </SidebarGroup>
        </Sidebar>
      </SidebarProvider>,
    );

    const label = container.querySelector('[data-slot="sidebar-group-label"]');

    // In icon-collapsed mode the label is pulled up over the previous group's
    // last menu item. It is invisible there, so it must stay out of hit
    // testing or the item loses its pointer cursor and click target.
    expect(label?.className).toContain("group-data-[collapsible=icon]:pointer-events-none");
  });
});
