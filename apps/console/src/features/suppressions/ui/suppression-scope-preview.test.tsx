// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { SourceSummary, SuppressionMatcher } from "@tocsin/core";

import { emptySuppressionMatcher } from "#/features/suppressions/model/suppression-form";
import { SuppressionScopePreview } from "#/features/suppressions/ui/suppression-scope-preview";
import { AppIntlProvider } from "#/i18n/provider";

describe("suppression scope preview", () => {
  afterEach(() => {
    cleanup();
  });

  it("says every dimension is unrestricted for an empty matcher", () => {
    renderPreview();

    expect(screen.getByText("All sources")).toBeTruthy();
    expect(screen.getByText("All severities")).toBeTruthy();
    expect(screen.getByText("All statuses")).toBeTruthy();
    expect(screen.queryByText(/narrow the match further/)).toBeNull();
  });

  it("names the pinned sources and flags disabled ones", () => {
    renderPreview(
      [
        sourceFixture({ id: "grafana-1", name: "Grafana" }),
        sourceFixture({ id: "paused-1", name: "Paused source", enabled: false }),
      ],
      {
        ...emptySuppressionMatcher(),
        sourceIds: ["grafana-1", "paused-1"],
      },
    );

    expect(screen.getByText("Grafana, Paused source (disabled)")).toBeTruthy();
  });

  it("keeps referencing a deleted source by id", () => {
    renderPreview([], {
      ...emptySuppressionMatcher(),
      sourceIds: ["gone-1"],
    });

    expect(screen.getByText("gone-1 (deleted)")).toBeTruthy();
  });

  it("translates the selected severities and statuses", () => {
    renderPreview([], {
      ...emptySuppressionMatcher(),
      severities: ["critical", "warning"],
      statuses: ["firing"],
    });

    expect(screen.getByText("Critical, Warning")).toBeTruthy();
    expect(screen.getByText("Firing")).toBeTruthy();
    expect(screen.queryByText("All severities")).toBeNull();
    expect(screen.queryByText("All statuses")).toBeNull();
  });

  it("announces conditions the panel does not list", () => {
    renderPreview([], {
      ...emptySuppressionMatcher(),
      titleContains: ["LatencyHigh"],
    });

    expect(
      screen.getByText("Fingerprint, label, title or message conditions narrow the match further"),
    ).toBeTruthy();
  });
});

function renderPreview(
  sources: SourceSummary[] = [],
  matcher: SuppressionMatcher = emptySuppressionMatcher(),
): void {
  render(
    <AppIntlProvider locale="en-US">
      <SuppressionScopePreview sources={sources} matcher={matcher} />
    </AppIntlProvider>,
  );
}

function sourceFixture(overrides: { id: string; name: string; enabled?: boolean }): SourceSummary {
  return {
    id: overrides.id,
    name: overrides.name,
    provider: "generic",
    enabled: overrides.enabled ?? true,
  };
}
