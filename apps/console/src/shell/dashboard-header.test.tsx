// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { AppIntlProvider } from "#/i18n/provider";
import { DashboardHeader } from "#/shell/dashboard-header";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    className,
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  ClientOnly: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("#/shell/dashboard-user-menu", () => {
  function DashboardUserMenuMock({
    user,
  }: {
    user: { name: string | null; email: string; image: string | null; role: string | null };
  }) {
    return <button type="button">{user.name ?? user.email}</button>;
  }

  DashboardUserMenuMock.Skeleton = function DashboardUserMenuSkeleton() {
    return <span data-testid="user-menu-skeleton">Loading user</span>;
  };

  return { DashboardUserMenu: DashboardUserMenuMock };
});

describe("dashboard header", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders operational nav and user menu without inert notification or help controls", () => {
    render(
      <AppIntlProvider locale="en-US">
        <DashboardHeader
          user={{
            name: "Ops Owner",
            email: "admin@example.test",
            image: null,
            role: "owner",
          }}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByRole("navigation", { name: "Dashboard" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Tocsin" })).toHaveProperty(
      "href",
      expect.stringContaining("/events"),
    );
    expect(screen.getByRole("link", { name: "Events" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sources" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Routes" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Destinations" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Deliveries" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ops Owner" })).toBeTruthy();

    expect(screen.queryByTitle("Notifications")).toBeNull();
    expect(screen.queryByTitle("Help")).toBeNull();
    expect(screen.queryByRole("button", { name: "Notifications" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Help" })).toBeNull();
  });
});
