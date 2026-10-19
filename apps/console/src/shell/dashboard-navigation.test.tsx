// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { SidebarProvider } from "#/components/ui/sidebar";
import { AppIntlProvider } from "#/i18n/provider";
import { DashboardNavigation } from "#/shell/dashboard-navigation";

const testState = vi.hoisted(() => ({ pathname: "/sources" }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to: string;
    children: React.ReactNode;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: testState.pathname } }),
  ClientOnly: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("#/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("#/shell/dashboard-user-menu", () => {
  function DashboardUserMenuMock({
    user,
    variant,
  }: {
    user: { name: string | null; email: string; image: string | null; role: string | null };
    variant?: "header" | "sidebar";
  }) {
    return (
      <button type="button">
        {user.name ?? user.email} ({variant})
      </button>
    );
  }

  DashboardUserMenuMock.Skeleton = function DashboardUserMenuSkeleton() {
    return <span data-testid="user-menu-skeleton">Loading user</span>;
  };

  return { DashboardUserMenu: DashboardUserMenuMock };
});

const user = {
  name: "Ops Owner",
  email: "admin@example.test",
  image: null,
  role: "owner",
};

describe("dashboard navigation", () => {
  afterEach(() => {
    cleanup();
    testState.pathname = "/sources";
  });

  it("renders grouped operational navigation in the sidebar", () => {
    render(
      <AppIntlProvider locale="en-US">
        <SidebarProvider>
          <DashboardNavigation user={user} />
        </SidebarProvider>
      </AppIntlProvider>,
    );

    expect(screen.getByRole("navigation", { name: "Dashboard" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Tocsin home" })).toHaveProperty(
      "href",
      expect.stringContaining("/events"),
    );
    expect(screen.getByRole("link", { name: "Events" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sources" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Routes" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Suppressions" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Destinations" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Deliveries" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Feishu apps" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ops Owner \(sidebar\)/ })).toBeTruthy();
  });

  it("marks only the section matching the current path as active", () => {
    render(
      <AppIntlProvider locale="en-US">
        <SidebarProvider>
          <DashboardNavigation user={user} />
        </SidebarProvider>
      </AppIntlProvider>,
    );

    expect(screen.getByRole("link", { name: "Sources" }).hasAttribute("data-active")).toBe(true);
    expect(screen.getByRole("link", { name: "Events" }).hasAttribute("data-active")).toBe(false);
  });

  it("marks a detail route as part of its parent section", () => {
    testState.pathname = "/events/event-1";

    render(
      <AppIntlProvider locale="en-US">
        <SidebarProvider>
          <DashboardNavigation user={user} />
        </SidebarProvider>
      </AppIntlProvider>,
    );

    expect(screen.getByRole("link", { name: "Events" }).hasAttribute("data-active")).toBe(true);
  });
});
