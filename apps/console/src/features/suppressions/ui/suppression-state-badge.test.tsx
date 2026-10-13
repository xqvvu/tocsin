// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { SuppressionState } from "@tocsin/core";

import { SuppressionStateBadge } from "#/features/suppressions/ui/suppression-state-badge";
import { AppIntlProvider } from "#/i18n/provider";

function renderBadge(state: SuppressionState): HTMLElement {
  render(
    <AppIntlProvider locale="en-US">
      <SuppressionStateBadge state={state} />
    </AppIntlProvider>,
  );

  return screen.getByText(LABELS[state]);
}

const LABELS: Record<SuppressionState, string> = {
  scheduled: "Scheduled",
  active: "Active",
  expired: "Expired",
  disabled: "Disabled",
};

describe("suppression state badge", () => {
  afterEach(() => {
    cleanup();
  });

  it.each(Object.entries(LABELS))("renders the %s state as %s", (state, _label) => {
    expect(renderBadge(state as SuppressionState)).toBeTruthy();
  });

  it("treats only the active state as alarming", () => {
    const active = renderBadge("active");
    const activeClassName = active.className;

    cleanup();

    const expired = renderBadge("expired");

    expect(activeClassName).not.toBe(expired.className);
  });
});
