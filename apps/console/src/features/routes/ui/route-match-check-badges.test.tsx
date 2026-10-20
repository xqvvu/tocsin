// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { RouteMatchCheck } from "@tocsin/core";

import { RouteMatchCheckBadges } from "#/features/routes/ui/route-match-check-badges";
import { AppIntlProvider } from "#/i18n/provider";

afterEach(cleanup);

function renderBadges(checks: RouteMatchCheck[], locale: "zh-Hans" | "en-US" = "zh-Hans") {
  render(
    <AppIntlProvider locale={locale}>
      <RouteMatchCheckBadges checks={checks} />
    </AppIntlProvider>,
  );
}

describe("route match check badges", () => {
  it("localizes the event's actual severity instead of leaking the enum", () => {
    renderBadges([
      {
        field: "severity",
        matched: false,
        detail: "severity: expected critical, actual warning",
        condition: "compare",
        expected: ["critical"],
        actual: "warning",
      },
    ]);

    expect(screen.getByText("期望 严重，事件实际为 警告")).toBeTruthy();
    expect(screen.queryByText(/actual warning/)).toBeNull();
  });

  it("localizes the event's actual status", () => {
    renderBadges([
      {
        field: "status",
        matched: false,
        detail: "status: expected firing, actual resolved",
        condition: "compare",
        expected: ["firing"],
        actual: "resolved",
      },
    ]);

    expect(screen.getByText("期望 触发中，事件实际为 已恢复")).toBeTruthy();
  });

  it("renders the label field name once, ahead of the comparison evidence", () => {
    renderBadges([
      {
        field: "label",
        matched: true,
        detail: "label component expected api, actual web",
        condition: "compare",
        expected: ["api"],
        actual: "web",
        labelKey: "component",
      },
    ]);

    const badge = screen.getByTitle("label component expected api, actual web");
    expect(badge.textContent).toBe("标签component 期望 api，事件实际为 web");
  });

  it("does not repeat the label field name when the event lacks the label", () => {
    renderBadges([
      {
        field: "label",
        matched: false,
        detail: "label component expected api, event has no such label",
        condition: "compare",
        expected: ["api"],
        labelKey: "component",
      },
    ]);

    const badge = screen.getByTitle("label component expected api, event has no such label");
    expect(badge.textContent).toBe("标签component 期望 api，事件没有这个标签");
  });

  it("keeps the raw detail for immutable snapshots without a structured condition", () => {
    renderBadges([
      {
        field: "severity",
        matched: true,
        detail: "severity matched critical",
      },
    ]);

    expect(screen.getByText("severity matched critical")).toBeTruthy();
  });
});
