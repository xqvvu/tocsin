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
    directRouteCount: 0,
    catchAllRouteCount: 0,
    routeNames: [],
    blockedRouteNames: [],
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
});
