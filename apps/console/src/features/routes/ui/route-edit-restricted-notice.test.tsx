// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { RouteDefinition } from "@tocsin/core";

import { RouteEditRestrictedNotice } from "#/features/routes/ui/route-edit-restricted-notice";
import { AppIntlProvider } from "#/i18n/provider";

function multiConditionRule(): RouteDefinition["rule"] {
  return {
    sourceIds: ["source-grafana", "source-alertmanager"],
    severities: ["critical", "warning"],
    statuses: ["firing"],
    labels: [
      { key: "team", operator: "equals", value: "sre" },
      { key: "cluster", operator: "contains", value: "prod" },
    ],
    titleContains: ["Latency"],
    messageContains: ["timeout", "error"],
  };
}

function simpleRule(): RouteDefinition["rule"] {
  return {
    sourceIds: ["source-grafana"],
    severities: ["critical"],
    statuses: ["firing"],
    labels: [{ key: "team", operator: "equals", value: "sre" }],
    titleContains: ["Latency"],
    messageContains: ["timeout"],
  };
}

describe("RouteEditRestrictedNotice", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows preserved multi-condition counts using the real restriction helper", () => {
    render(
      <AppIntlProvider locale="en-US">
        <RouteEditRestrictedNotice rule={multiConditionRule()} />
      </AppIntlProvider>,
    );

    expect(screen.getByTestId("route-edit-restricted-notice")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Restricted multi-condition edit")).toBeTruthy();
    expect(
      screen.getByText(
        "This route has multiple conditions of the same type — the form edits only the first of each type and keeps the rest unchanged",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Sources: 2 conditions (edit first, keep 1)")).toBeTruthy();
    expect(screen.getByText("Severities: 2 conditions (edit first, keep 1)")).toBeTruthy();
    expect(screen.getByText("Labels: 2 conditions (edit first, keep 1)")).toBeTruthy();
    expect(screen.getByText("Message contains: 2 conditions (edit first, keep 1)")).toBeTruthy();
    expect(screen.queryByText(/Title contains: 2/)).toBeNull();
    expect(screen.queryByText(/Statuses: 2/)).toBeNull();
  });

  it("renders nothing for single-condition rules", () => {
    const { container } = render(
      <AppIntlProvider locale="en-US">
        <RouteEditRestrictedNotice rule={simpleRule()} />
      </AppIntlProvider>,
    );

    expect(container.textContent).toBe("");
    expect(screen.queryByTestId("route-edit-restricted-notice")).toBeNull();
  });
});
