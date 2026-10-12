// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { RouteDefinition, SourceSummary } from "@tocsin/core";

import { RouteEditRestrictedNotice } from "#/features/routes/ui/route-edit-restricted-notice";
import { AppIntlProvider } from "#/i18n/provider";

function configuredSource(id: string, name: string): SourceSummary {
  return {
    id,
    name,
    provider: "grafana",
    enabled: true,
  };
}

function ruleWithSources(sourceIds: string[]): RouteDefinition["rule"] {
  return {
    sourceIds,
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

function renderNotice(sourceIds: string[], sources: SourceSummary[]) {
  return render(
    <AppIntlProvider locale="en-US">
      <RouteEditRestrictedNotice rule={ruleWithSources(sourceIds)} sources={sources} />
    </AppIntlProvider>,
  );
}

describe("RouteEditRestrictedNotice", () => {
  afterEach(() => {
    cleanup();
  });

  it("names the stored source ids the picker cannot offer", () => {
    renderNotice(
      ["source-grafana", "source-retired"],
      [configuredSource("source-grafana", "Grafana")],
    );

    expect(screen.getByTestId("route-edit-restricted-notice")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Conditions outside the current configuration")).toBeTruthy();
    expect(
      screen.getByText(
        "This route references values that are no longer configured — they stay exactly as stored and can only be removed, not re-picked",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Sources: source-retired")).toBeTruthy();
  });

  it("renders nothing when every stored source is configured", () => {
    const { container } = renderNotice(
      ["source-grafana", "source-alertmanager"],
      [
        configuredSource("source-grafana", "Grafana"),
        configuredSource("source-alertmanager", "Alertmanager"),
      ],
    );

    expect(container.textContent).toBe("");
    expect(screen.queryByTestId("route-edit-restricted-notice")).toBeNull();
  });
});
