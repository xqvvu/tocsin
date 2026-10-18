// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { SettingsTimeZoneCombobox } from "#/features/configuration/ui/settings-time-zone-combobox";
import { AppIntlProvider } from "#/i18n/provider";

describe("settings time zone combobox", () => {
  beforeEach(() => {
    // TanStack Virtual measures its viewport with `clientHeight`/`clientWidth`
    // (it switched from the offset metrics in 3.19). jsdom reports both as 0,
    // so without these the virtualizer believes the list has no viewport and
    // renders no rows at all. Keep the offset metrics too: element measurement
    // still reads them.
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.dataset.slot === "time-zone-virtualized-list" ? 288 : 32;
    });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(320);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.dataset.slot === "time-zone-virtualized-list" ? 288 : 32;
    });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(320);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const height =
        this.dataset.slot === "time-zone-virtualized-list"
          ? 288
          : this.getAttribute("role") === "option"
            ? 32
            : 0;

      return {
        bottom: height,
        height,
        left: 0,
        right: 320,
        top: 0,
        width: 320,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      };
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("virtualizes the full list and defers filtering to matching time zones", async () => {
    const onChange = vi.fn<(value: string) => void>();

    render(
      <AppIntlProvider locale="en-US">
        <label htmlFor="time-zone">Time zone</label>
        <SettingsTimeZoneCombobox
          id="time-zone"
          invalid={false}
          value="UTC"
          onBlur={vi.fn<() => void>()}
          onChange={onChange}
        />
      </AppIntlProvider>,
    );

    const input = screen.getByRole("combobox", { name: "Time zone" });

    fireEvent.click(screen.getByRole("button"));
    fireEvent.change(input, { target: { value: "" } });

    await waitFor(() => {
      const renderedOptions = screen.getAllByRole("option");
      expect(renderedOptions.length).toBeLessThan(30);
      expect(Number(renderedOptions[0]?.getAttribute("aria-setsize"))).toBeGreaterThan(60);
    });

    const scrollElement = document.querySelector<HTMLElement>(
      '[data-slot="time-zone-virtualized-list"]',
    );
    expect(scrollElement).not.toBeNull();

    fireEvent.scroll(scrollElement!, { target: { scrollTop: 80 * 32 } });
    await waitFor(() => {
      expect(
        screen
          .getAllByRole("option")
          .some((option) => Number(option.getAttribute("aria-posinset")) > 60),
      ).toBe(true);
    });

    fireEvent.change(input, { target: { value: "Shanghai" } });
    await waitFor(() => {
      expect(screen.getAllByRole("option")).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole("option", { name: "Asia/Shanghai" }));
    expect(onChange).toHaveBeenCalledWith("Asia/Shanghai");
  });
});
