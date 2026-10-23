// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { DeliveriesPageToolbar } from "#/features/deliveries/ui/deliveries-page-toolbar";
import { AppIntlProvider } from "#/i18n/provider";

describe("deliveries page toolbar", () => {
  afterEach(cleanup);

  it("leaves the worker action alone while delivery is running", () => {
    renderToolbar({ paused: false });

    const button = screen.getByRole("button", {
      name: "Run worker",
    }) as HTMLButtonElement;

    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-describedby")).toBeNull();
    expect(screen.queryByText(/Outbound delivery is paused/)).toBeNull();
  });

  it("renders the paused reason as text and describes the worker action", () => {
    renderToolbar({ paused: true });

    const button = screen.getByRole("button", {
      name: "Run worker",
    }) as HTMLButtonElement;
    const hint = screen.getByText(
      "Outbound delivery is paused, resume it before running the worker",
    );

    // A paused queue cannot be claimed, so the reason has to be visible without
    // a hover tooltip and reachable from the button for assistive technology.
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-describedby")).toBe(hint.id);
  });

  it("names the page-level reset distinctly from the filter bar and empty state", () => {
    renderToolbar();

    // All three resets clear the same filters. The visible label is shared, so
    // the accessible name carries the scope instead.
    const reset = screen.getByRole("button", { name: "Reset delivery filters" });

    expect(reset.textContent).toContain("Reset filters");
    expect(reset.getAttribute("title")).toBe("Reset delivery filters");
  });

  it("disables the worker while another action is pending", () => {
    renderToolbar({ pending: true });

    expect((screen.getByRole("button", { name: "Run worker" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});

function renderToolbar(props: { pending?: boolean; paused?: boolean } = {}): void {
  render(
    <AppIntlProvider locale="en-US">
      <DeliveriesPageToolbar
        pending={props.pending ?? false}
        paused={props.paused ?? false}
        onRunWorker={vi.fn()}
        onResetFilters={vi.fn()}
      />
    </AppIntlProvider>,
  );
}
