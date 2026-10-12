// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { EventDeliveryCountsCell } from "#/features/events/ui/event-delivery-counts-cell";
import { AppIntlProvider } from "#/i18n/provider";

describe("event delivery counts cell", () => {
  afterEach(() => {
    cleanup();
  });

  it("counts a suppressed delivery toward the total and shows its badge", () => {
    render(
      <AppIntlProvider locale="en-US">
        <EventDeliveryCountsCell
          routeMatchCount={1}
          counts={{ pending: 0, running: 0, succeeded: 0, failed: 0, suppressed: 2 }}
        />
      </AppIntlProvider>,
    );

    // The suppressed count is non-zero, so the cell must not fall back to the
    // bare "0" badge that a dropped state would produce.
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.getByText("Suppressed")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });
});
