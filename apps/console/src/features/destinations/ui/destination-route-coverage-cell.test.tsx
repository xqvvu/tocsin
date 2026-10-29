// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { DestinationRouteCoverage } from "#/features/destinations/model/destination-route-coverage";
import { DestinationRouteCoverageCell } from "#/features/destinations/ui/destination-route-coverage-cell";
import { AppIntlProvider } from "#/i18n/provider";

function coverage(overrides: Partial<DestinationRouteCoverage>): DestinationRouteCoverage {
  return {
    enabledRouteCount: 0,
    reachableRouteCount: 0,
    blockedRouteCount: 0,
    disabledRouteCount: 0,
    conditionalRouteCount: 0,
    routeNames: [],
    blockedRouteNames: [],
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
            reachableRouteCount: 2,
            routeNames: ["全部告警", "结算告警"],
          })}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("2 条可达")).toBeTruthy();
  });

  it("flags routes that only deliver when the event matches a condition", () => {
    render(
      <AppIntlProvider locale="zh-Hans">
        <DestinationRouteCoverageCell
          coverage={coverage({
            enabledRouteCount: 2,
            reachableRouteCount: 2,
            routeNames: ["全部告警", "仅严重级别"],
            conditionalRouteCount: 1,
            conditionalRouteNames: ["仅严重级别"],
          })}
        />
      </AppIntlProvider>,
    );

    // "2 条可达" alone read as "everything routed here is delivered".
    const badge = screen.getByText("2 条可达 · 1 条带条件");
    expect(badge.getAttribute("title")).toContain(
      "其中 1 条还需事件满足级别、状态、标签或文本条件",
    );
    expect(badge.getAttribute("title")).toContain("仅严重级别");
  });

  it("shows the reachable share when some routes have no enabled source", () => {
    render(
      <AppIntlProvider locale="zh-Hans">
        <DestinationRouteCoverageCell
          coverage={coverage({
            enabledRouteCount: 3,
            reachableRouteCount: 2,
            blockedRouteCount: 1,
            routeNames: ["全部告警", "结算告警", "已停用源的告警"],
            blockedRouteNames: ["已停用源的告警"],
          })}
        />
      </AppIntlProvider>,
    );

    const badge = screen.getByText("2/3 条可达");
    expect(badge.getAttribute("title")).toContain(
      "其中 1 条路由匹配的告警源全部停用且不会产生投递",
    );
    expect(badge.getAttribute("title")).toContain("已停用源的告警");
  });

  it("shows a blocked state when every enabled route has no enabled source", () => {
    render(
      <AppIntlProvider locale="zh-Hans">
        <DestinationRouteCoverageCell
          coverage={coverage({
            enabledRouteCount: 1,
            blockedRouteCount: 1,
            routeNames: ["Grafana 分页"],
            blockedRouteNames: ["Grafana 分页"],
          })}
        />
      </AppIntlProvider>,
    );

    const badge = screen.getByText("告警源全停用");
    expect(badge.getAttribute("title")).toContain(
      "但匹配的告警源全部停用或不存在，当前不会有告警到达",
    );
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
