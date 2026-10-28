// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { ReplayUrgentPagingImpact } from "@tocsin/core";

import { ReplayUrgentPagingNotice } from "#/features/operations/ui/replay-urgent-paging-notice";
import { AppIntlProvider } from "#/i18n/provider";

const impact: ReplayUrgentPagingImpact = {
  deliveryCount: 2,
  receiverCount: 3,
  destinations: [
    { destinationId: "destination-1", destinationName: "Primary on-call", receiverCount: 3 },
  ],
};

function renderNotice(value: ReplayUrgentPagingImpact) {
  return render(
    <AppIntlProvider locale="en-US">
      <ReplayUrgentPagingNotice impact={value} />
    </AppIntlProvider>,
  );
}

describe("replay urgent paging notice", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when the replay pages nobody", () => {
    const { container } = renderNotice({ ...impact, deliveryCount: 0, receiverCount: 0 });

    expect(container.firstElementChild).toBeNull();
  });

  it("names the destinations and the call upper bound", () => {
    renderNotice(impact);

    const note = screen.getByRole("note");

    expect(note.textContent).toContain("3 receivers");
    expect(note.textContent).toContain("2 new deliveries");
    expect(note.textContent).toContain("Primary on-call ×3");
  });

  it("keeps the warning text on an un-tinted surface", () => {
    // The faint `bg-destructive/5` tint dropped the 12px title to 4.36:1 and
    // the 11px note to 4.34:1, both below the 4.5:1 AA threshold, on the one
    // notice that precedes an irreversible phone page. The border and the red
    // title carry the urgency; the background must stay the page surface.
    renderNotice(impact);

    const note = screen.getByRole("note");

    expect(note.className).not.toContain("bg-destructive");
    expect(note.className).toContain("border-destructive/40");
  });
});
