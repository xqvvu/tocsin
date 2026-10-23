// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { EventDetailData } from "#/features/events/ui/event-detail-types";
import { EventDetailView } from "#/features/events/ui/event-detail-view";
import { AppIntlProvider } from "#/i18n/provider";

// The view owns the layout contract under test; the panels are exercised
// individually elsewhere. Keeping them out of this render also keeps the test
// from pulling query, router and mutation providers in for no reason.
vi.mock("#/features/events/ui/event-detail-summary", () => ({
  EventDetailSummary: () => <div data-testid="summary" />,
}));
vi.mock("#/features/events/ui/event-normalized-tab", () => ({
  EventNormalizedTab: () => <div />,
}));
vi.mock("#/features/events/ui/event-detail-route-matches-table", () => ({
  EventDetailRouteMatchesTable: () => <div />,
}));
vi.mock("#/features/events/ui/event-detail-route-gaps", () => ({
  EventDetailRouteGaps: () => <div />,
}));
vi.mock("#/features/events/ui/event-detail-deliveries-table", () => ({
  EventDetailDeliveriesTable: () => <div />,
}));
vi.mock("#/features/events/ui/event-fingerprint-context-tab", () => ({
  EventFingerprintContextTab: () => <div />,
}));
vi.mock("#/features/events/ui/event-raw-tab", () => ({
  EventRawTab: () => <div />,
}));

describe("event detail view", () => {
  afterEach(() => {
    cleanup();
  });

  it("offers every tab in zh-Hans, including the localized raw debug label", () => {
    renderView("zh-Hans");

    for (const label of ["标准化字段", "路由匹配", "投递", "同指纹", "原始调试"]) {
      expect(screen.getByRole("tab", { name: label }), `tab ${label} missing`).toBeTruthy();
    }

    expect(screen.queryByRole("tab", { name: "Raw debug" })).toBeNull();
  });

  it("stacks below lg so the summary cannot squeeze the tab panels", () => {
    const { container } = renderView("en-US");

    const root = container.firstElementChild;

    // `h-full` at every width made the view shrink to the space left over by
    // the summary; the panels then collapsed to a few pixels on a 390px
    // viewport. Full height is now desktop-only.
    expect(root?.classList.contains("lg:h-full")).toBe(true);
    expect(root?.classList.contains("h-full")).toBe(false);

    // Five English labels overflow a 390px tab list, so the list wraps instead
    // of hiding the last tabs behind an unhinted horizontal scroll.
    const tabsList = screen.getByRole("tablist");

    expect(tabsList.className).toContain("max-lg:flex-wrap");
  });
});

function renderView(locale: "en-US" | "zh-Hans") {
  return render(
    <AppIntlProvider locale={locale}>
      <EventDetailView detail={detail()} />
    </AppIntlProvider>,
  );
}

function detail(): EventDetailData {
  return {
    event: { id: "evt-1" },
    routeMatches: [],
    routeMatchGaps: [],
    routeMatchesProvenance: "intake_snapshot",
    deliveries: [],
  } as unknown as EventDetailData;
}
