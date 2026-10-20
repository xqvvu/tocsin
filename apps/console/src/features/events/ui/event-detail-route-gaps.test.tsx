// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { RouteMatchGap } from "@tocsin/core";

import { EventDetailRouteGaps } from "#/features/events/ui/event-detail-route-gaps";
import { AppIntlProvider } from "#/i18n/provider";

// The gap table only needs Link's destination, so the test renders a plain
// anchor instead of standing up a router.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, params }: { children: ReactNode; params?: { eventId: string } }) => (
    <a href={`/events/${params?.eventId ?? ""}`}>{children}</a>
  ),
}));

describe("event detail route gaps", () => {
  afterEach(() => {
    cleanup();
  });

  it("links the first event of a deduplicated gap so the winning delivery is one click away", () => {
    renderGaps("zh-Hans", [
      gap({ reason: "duplicate_within_window", firstEventId: "evt_original" }),
    ]);

    const link = screen.getByRole("link", { name: "evt_original" });
    expect(link.getAttribute("href")).toBe("/events/evt_original");
    expect(link.parentElement?.textContent).toContain("未创建投递");
    expect(link.parentElement?.textContent).toContain("首次由事件");
    expect(link.parentElement?.textContent).toContain("触发");
  });

  it("admits the first event is unknown once the dedupe row is pruned", () => {
    renderGaps("zh-Hans", [gap({ reason: "duplicate_within_window", firstEventId: null })]);

    expect(screen.queryByRole("link")).toBeNull();
    expect(
      screen.getByText("该路由没有投递记录，且原因无法从 Tocsin 保留的记录中复原"),
    ).toBeTruthy();
  });

  it("does not invent a link for reasons that cannot name another event", () => {
    renderGaps("zh-Hans", [
      gap({ reason: "destination_disabled", destinationId: "dst_1", destinationName: "Pager" }),
    ]);

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("该目标已停用")).toBeTruthy();
  });

  it("localizes the linked sentence in English", () => {
    renderGaps("en-US", [gap({ reason: "duplicate_within_window", firstEventId: "evt_original" })]);

    const link = screen.getByRole("link", { name: "evt_original" });
    expect(link.getAttribute("href")).toBe("/events/evt_original");
    expect(link.parentElement?.textContent).toContain("first triggered by event");
  });
});

function renderGaps(locale: "zh-Hans" | "en-US", gaps: RouteMatchGap[]) {
  render(
    <AppIntlProvider locale={locale}>
      <EventDetailRouteGaps gaps={gaps} />
    </AppIntlProvider>,
  );
}

function gap(overrides: Partial<RouteMatchGap>): RouteMatchGap {
  return {
    routeId: "rt_1",
    routeName: "Critical to Pager",
    destinationId: null,
    destinationName: null,
    reason: "unknown",
    firstEventId: null,
    ...overrides,
  };
}
