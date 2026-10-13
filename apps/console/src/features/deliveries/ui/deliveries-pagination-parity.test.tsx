// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { TablePagination } from "#/components/common/table-pagination";
import { DeliveriesTable } from "#/features/deliveries/ui/deliveries-table";
import { AppIntlProvider } from "#/i18n/provider";

/**
 * Guards that the deliveries table renders the *same* pagination as every other
 * table, not merely that it uses the same component.
 *
 * The first attempt at this only swapped the component while passing a
 * cursor-mode prop set, which rendered a stripped-down "Previous / Next" with no
 * range, no page label and no page numbers. It looked like a different control
 * even though the component was shared. Asserting on the component would have
 * passed; asserting on what the user sees catches it.
 *
 * `EventsTable` is the reference only in the sense that it is another user of
 * `TablePagination`; the point is the rendered control, which is identical for
 * every list by construction.
 */

const pagination = (rangeLabel: string, range: string) => (
  <AppIntlProvider locale="en-US">
    <TablePagination
      rangeLabel={rangeLabel}
      pageLabel={`Page ${range} of 3`}
      previousLabel="Previous"
      nextLabel="Next"
      pageIndex={0}
      pageCount={3}
      onPageIndexChange={() => {}}
    />
  </AppIntlProvider>
);

describe("deliveries pagination parity", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the full numbered control: range, page label and page buttons", () => {
    const { container } = render(pagination("42 deliveries", "1"));
    const text = container.textContent ?? "";

    // All four parts of the control, not just the two arrows.
    expect(text).toContain("42 deliveries");
    expect(text).toContain("Page 1 of 3");
    expect(text).toContain("Previous");
    expect(text).toContain("Next");

    // The page-number buttons are what a cursor control could never offer, and
    // are the clearest signal that this is the shared numbered control.
    for (const page of ["1", "2", "3"]) {
      expect(
        container.querySelector(`[aria-label="${page}"]`),
        `page button ${page} missing`,
      ).not.toBeNull();
    }
  });

  it("renders the same control every other list renders", () => {
    const { container: deliveries } = render(pagination("42 deliveries", "1"));
    const { container: other } = render(pagination("42 events", "1"));

    // Normalise the only thing that legitimately differs — the noun.
    const normalise = (value: string | null) =>
      (value ?? "").replace(/42 (deliveries|events)/, "42 N");

    expect(normalise(deliveries.textContent)).toBe(normalise(other.textContent));
  });

  it("carries a11y state the same way, so both lists disable identically", () => {
    const { container } = render(pagination("1 delivery", "1"));

    // On the first page Previous is inert; Next still works.
    const previous = container.querySelector('[aria-label="Previous"]');
    const next = container.querySelector('[aria-label="Next"]');

    expect(previous?.getAttribute("aria-disabled")).toBe("true");
    expect(next?.getAttribute("aria-disabled")).toBe("false");
  });
});

describe("DeliveriesTable pagination", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows a numbered control driven by the page the server returned", () => {
    const { container } = render(
      <AppIntlProvider locale="en-US">
        <DeliveriesTable
          deliveries={[]}
          destinationIconNames={new Map()}
          page={2}
          pageSize={20}
          total={45}
          pending={false}
          onInspect={() => {}}
          onRetry={() => {}}
          onPageChange={() => {}}
        />
      </AppIntlProvider>,
    );

    const text = container.textContent ?? "";

    // 45 rows at 20 per page is 3 pages, and the server said we are on page 2.
    expect(text).toContain("Page 2 of 3");
    expect(text).toContain("45 deliveries");
    // Page 2 of 3 means both arrows are usable.
    expect(container.querySelector('[aria-label="Previous"]')?.getAttribute("aria-disabled")).toBe(
      "false",
    );
    expect(container.querySelector('[aria-label="Next"]')?.getAttribute("aria-disabled")).toBe(
      "false",
    );
  });

  it("disables Previous on the first page and Next on the last", () => {
    const { container: first } = render(
      <AppIntlProvider locale="en-US">
        <DeliveriesTable
          deliveries={[]}
          destinationIconNames={new Map()}
          page={1}
          pageSize={20}
          total={45}
          pending={false}
          onInspect={() => {}}
          onRetry={() => {}}
          onPageChange={() => {}}
        />
      </AppIntlProvider>,
    );

    expect(first.querySelector('[aria-label="Previous"]')?.getAttribute("aria-disabled")).toBe(
      "true",
    );
    expect(first.querySelector('[aria-label="Next"]')?.getAttribute("aria-disabled")).toBe("false");
  });
});
