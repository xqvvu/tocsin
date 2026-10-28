// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { DestinationRouteCoverage } from "#/features/destinations/model/destination-route-coverage";
import { DestinationRouteCoverageCell } from "#/features/destinations/ui/destination-route-coverage-cell";
import { AppIntlProvider } from "#/i18n/provider";

function coverage(overrides: Partial<DestinationRouteCoverage>): DestinationRouteCoverage {
  return {
    enabledRouteCount: 0,
    disabledRouteCount: 0,
    conditionalRouteCount: 0,
    routeNames: [],
    conditionalRouteNames: [],
    ...overrides,
  };
}

describe("destination route coverage cell", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the plain count when every enabled route always delivers here", () => {
    render(
      <AppIntlProvider locale="zh-Hans">
        <DestinationRouteCoverageCell
          coverage={coverage({
            enabledRouteCount: 2,
            routeNames: ["全部告警", "结算告警"],
          })}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("2 条生效")).toBeTruthy();
  });

  it("flags routes that only deliver when the event matches a condition", () => {
    render(
      <AppIntlProvider locale="zh-Hans">
        <DestinationRouteCoverageCell
          coverage={coverage({
            enabledRouteCount: 2,
            routeNames: ["全部告警", "仅严重级别"],
            conditionalRouteCount: 1,
            conditionalRouteNames: ["仅严重级别"],
          })}
        />
      </AppIntlProvider>,
    );

    // "2 条生效" alone read as "everything routed here is delivered".
    const badge = screen.getByText("2 条生效 · 1 条带条件");
    expect(badge.getAttribute("title")).toContain(
      "其中 1 条还需事件满足级别、状态、标签或文本条件",
    );
    expect(badge.getAttribute("title")).toContain("仅严重级别");
  });

  it("keeps the source-side wording when no route is enabled", () => {
    render(
      <AppIntlProvider locale="zh-Hans">
        <DestinationRouteCoverageCell coverage={coverage({ disabledRouteCount: 1 })} />
      </AppIntlProvider>,
    );

    expect(screen.getByText("无生效路由")).toBeTruthy();
  });
});
