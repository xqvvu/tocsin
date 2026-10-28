// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { SourceRouteCoverage } from "#/features/sources/model/source-route-coverage";
import { SourceRouteCoverageCell } from "#/features/sources/ui/source-route-coverage-cell";
import { AppIntlProvider } from "#/i18n/provider";

function coverage(overrides: Partial<SourceRouteCoverage>): SourceRouteCoverage {
  return {
    enabledRouteCount: 0,
    deliverableRouteCount: 0,
    blockedRouteCount: 0,
    conditionalRouteCount: 0,
    directRouteCount: 0,
    catchAllRouteCount: 0,
    routeNames: [],
    blockedRouteNames: [],
    conditionalRouteNames: [],
    ...overrides,
  };
}

describe("source route coverage cell", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the deliverable share when only some routes can deliver", () => {
    render(
      <AppIntlProvider locale="zh-Hans">
        <SourceRouteCoverageCell
          coverage={coverage({
            enabledRouteCount: 2,
            deliverableRouteCount: 1,
            blockedRouteCount: 1,
            routeNames: ["checkout", "billing"],
            blockedRouteNames: ["billing"],
          })}
        />
      </AppIntlProvider>,
    );

    // Partial coverage used to read "1 条可投递" and hide the blocked route in
    // the hover title, so the table looked fully covered at a glance.
    expect(screen.getByText("1/2 条可投递")).toBeTruthy();
  });

  it("keeps the plain count when every enabled route can deliver", () => {
    render(
      <AppIntlProvider locale="zh-Hans">
        <SourceRouteCoverageCell
          coverage={coverage({
            enabledRouteCount: 2,
            deliverableRouteCount: 2,
            routeNames: ["checkout", "billing"],
          })}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("2 条可投递")).toBeTruthy();
  });

  it("flags routes that only deliver when the event matches a condition", () => {
    render(
      <AppIntlProvider locale="zh-Hans">
        <SourceRouteCoverageCell
          coverage={coverage({
            enabledRouteCount: 2,
            deliverableRouteCount: 2,
            routeNames: ["全部告警", "仅严重级别"],
            conditionalRouteCount: 1,
            conditionalRouteNames: ["仅严重级别"],
          })}
        />
      </AppIntlProvider>,
    );

    // "2 条可投递" alone read as "every alert from this source is delivered".
    const badge = screen.getByText("2 条可投递 · 1 条带条件");
    expect(badge.getAttribute("title")).toContain(
      "其中 1 条还需事件满足级别、状态、标签或文本条件",
    );
    expect(badge.getAttribute("title")).toContain("仅严重级别");
  });

  it("keeps the deliverable share when conditional routes are also blocked", () => {
    render(
      <AppIntlProvider locale="zh-Hans">
        <SourceRouteCoverageCell
          coverage={coverage({
            enabledRouteCount: 3,
            deliverableRouteCount: 2,
            blockedRouteCount: 1,
            routeNames: ["全部告警", "仅严重级别", "目标停用"],
            blockedRouteNames: ["目标停用"],
            conditionalRouteCount: 1,
            conditionalRouteNames: ["仅严重级别"],
          })}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("2/3 条可投递 · 1 条带条件")).toBeTruthy();
  });
});
