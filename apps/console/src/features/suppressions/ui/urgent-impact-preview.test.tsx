// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { DestinationListItem, SuppressionMatcher } from "@tocsin/core";

import { emptySuppressionMatcher } from "#/features/suppressions/model/suppression-form";
import { UrgentImpactPreview } from "#/features/suppressions/ui/urgent-impact-preview";
import { AppIntlProvider } from "#/i18n/provider";

describe("urgent impact preview", () => {
  afterEach(() => {
    cleanup();
  });

  it("discloses the silenced destinations when none of them page automatically", () => {
    renderPreview([
      destinationFixture({ id: "audit", name: "Audit channel", urgentAutoEnabled: false }),
      destinationFixture({ id: "chat", name: "Team chat", urgentAutoEnabled: false }),
    ]);

    expect(screen.getByText("No automatic paging in scope")).toBeTruthy();
    expect(
      screen.getByText(
        "Enabled destinations in scope: 2 — matching alerts are still silenced and cannot be buzzed manually",
      ),
    ).toBeTruthy();
  });

  it("says the rule is inert when every destination in scope is disabled", () => {
    renderPreview([
      destinationFixture({
        id: "paused",
        name: "Paused pager",
        urgentAutoEnabled: true,
        enabled: false,
      }),
    ]);

    expect(screen.getByText("No enabled destinations in scope")).toBeTruthy();
    expect(
      screen.getByText(
        "This rule cannot silence anything because no enabled destination is currently in scope",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("No automatic paging in scope")).toBeNull();
  });

  it("names the paging destinations and summarizes the wider silenced scope", () => {
    renderPreview([
      destinationFixture({ id: "pager", name: "Primary pager", urgentAutoEnabled: true }),
      destinationFixture({ id: "audit", name: "Audit channel", urgentAutoEnabled: false }),
    ]);

    expect(
      screen.getByText("1 destination with automatic paging falls inside this rule"),
    ).toBeTruthy();
    expect(screen.getByText("Affected destinations: Primary pager")).toBeTruthy();
    expect(
      screen.getByText("Enabled destinations in scope: 2 — the rest are silenced too"),
    ).toBeTruthy();
  });

  it("omits the scope summary when every scoped destination pages automatically", () => {
    renderPreview([
      destinationFixture({ id: "pager", name: "Primary pager", urgentAutoEnabled: true }),
    ]);

    expect(screen.queryByText(/Enabled destinations in scope/)).toBeNull();
  });

  it("honours the destination scope", () => {
    renderPreview(
      [
        destinationFixture({ id: "in-scope", name: "In scope", urgentAutoEnabled: false }),
        destinationFixture({ id: "out-of-scope", name: "Out of scope", urgentAutoEnabled: false }),
      ],
      { ...emptySuppressionMatcher(), destinationIds: ["in-scope"] },
    );

    expect(
      screen.getByText(
        "Enabled destinations in scope: 1 — matching alerts are still silenced and cannot be buzzed manually",
      ),
    ).toBeTruthy();
  });
});

function renderPreview(
  destinations: DestinationListItem[],
  matcher: SuppressionMatcher = emptySuppressionMatcher(),
): void {
  render(
    <AppIntlProvider locale="en-US">
      <UrgentImpactPreview destinations={destinations} matcher={matcher} />
    </AppIntlProvider>,
  );
}

function destinationFixture(overrides: {
  id: string;
  name: string;
  urgentAutoEnabled: boolean;
  enabled?: boolean;
}): DestinationListItem {
  return {
    id: overrides.id,
    name: overrides.name,
    kind: "feishu",
    enabled: overrides.enabled ?? true,
    operationalConfig: {
      endpoint: null,
      host: null,
      method: null,
      to: null,
      from: null,
      replyTo: null,
      subjectPrefix: null,
      headerNames: null,
      templateConfigured: false,
      templateMode: null,
      templateSource: null,
      signingConfigured: false,
      secretFieldPaths: [],
      sendMode: "app",
      appRef: null,
      chatId: null,
      urgentAutoEnabled: overrides.urgentAutoEnabled,
      urgentReceivers: ["ou_1"],
    },
  };
}
