// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { SidebarProvider } from "#/components/ui/sidebar";
import { AppIntlProvider } from "#/i18n/provider";
import { DashboardHeader } from "#/shell/dashboard-header";

vi.mock("#/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("#/features/suppressions/ui/active-suppression-indicator", () => ({
  ActiveSuppressionIndicator: () => <span data-testid="active-suppression-indicator" />,
}));

vi.mock("#/features/configuration/ui/delivery-pause-indicator", () => ({
  DeliveryPauseIndicator: () => <span data-testid="delivery-pause-indicator" />,
}));

vi.mock("#/features/deliveries/ui/delivery-failure-indicator", () => ({
  DeliveryFailureIndicator: () => <span data-testid="delivery-failure-indicator" />,
}));

describe("dashboard header", () => {
  afterEach(cleanup);

  it("renders app chrome and global indicators without a page title", () => {
    render(
      <AppIntlProvider locale="en-US">
        <SidebarProvider>
          <DashboardHeader />
        </SidebarProvider>
      </AppIntlProvider>,
    );

    expect(screen.getByRole("button", { name: "Toggle sidebar" })).toBeTruthy();
    expect(screen.getByTestId("delivery-pause-indicator")).toBeTruthy();
    expect(screen.getByTestId("delivery-failure-indicator")).toBeTruthy();
    expect(screen.getByTestId("active-suppression-indicator")).toBeTruthy();

    // The current section is marked by the sidebar and by the page's own
    // `PageToolbar` heading. Repeating it here duplicated both and rendered the
    // only title in the app at chrome size, with an icon that did not match.
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByText("Sources")).toBeNull();
  });
});
