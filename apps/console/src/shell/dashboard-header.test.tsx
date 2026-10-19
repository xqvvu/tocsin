// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { SidebarProvider } from "#/components/ui/sidebar";
import { AppIntlProvider } from "#/i18n/provider";
import { DashboardHeader } from "#/shell/dashboard-header";

const testState = vi.hoisted(() => ({ pathname: "/sources" }));

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: testState.pathname } }),
}));

vi.mock("#/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("#/features/suppressions/ui/active-suppression-indicator", () => ({
  ActiveSuppressionIndicator: () => <span data-testid="active-suppression-indicator" />,
}));

describe("dashboard header", () => {
  afterEach(() => {
    cleanup();
    testState.pathname = "/sources";
  });

  it("shows the sidebar trigger and the current section", () => {
    render(
      <AppIntlProvider locale="en-US">
        <SidebarProvider>
          <DashboardHeader />
        </SidebarProvider>
      </AppIntlProvider>,
    );

    expect(screen.getByRole("button", { name: "Toggle sidebar" })).toBeTruthy();
    expect(screen.getByText("Sources")).toBeTruthy();
    expect(screen.getByTestId("active-suppression-indicator")).toBeTruthy();
  });

  it("falls back to the console label outside registered sections", () => {
    testState.pathname = "/not-registered";

    render(
      <AppIntlProvider locale="en-US">
        <SidebarProvider>
          <DashboardHeader />
        </SidebarProvider>
      </AppIntlProvider>,
    );

    expect(screen.getByText("Console")).toBeTruthy();
  });
});
