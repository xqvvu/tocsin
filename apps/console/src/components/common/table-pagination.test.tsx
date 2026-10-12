// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { TablePagination } from "#/components/common/table-pagination";

describe("table pagination", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders compact page jumps with first, current neighbors, last, and ellipses", () => {
    const onPageIndexChange = vi.fn<(pageIndex: number) => void>();

    render(
      <TablePagination
        rangeLabel="41-50 of 100"
        pageLabel="Page 5 / 10"
        previousLabel="Previous"
        nextLabel="Next"
        pageIndex={4}
        pageCount={10}
        onPageIndexChange={onPageIndexChange}
      />,
    );

    expect(screen.getByRole("button", { name: "1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "4" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "5" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "6" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "10" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "10" }));

    expect(onPageIndexChange).toHaveBeenCalledWith(9);
  });
  it("cursor mode offers the same Previous/Next language as page mode", () => {
    render(
      <TablePagination
        mode="cursor"
        previousLabel="Previous"
        nextLabel="Next"
        canPrevious
        canNext
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    );

    // The point of the change: a cursor list reads as Previous/Next, not as a
    // differently-worded "Latest/Older" control of its own.
    expect(screen.getByRole("button", { name: "Previous" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "1" })).toBeNull();
  });

  it("cursor mode disables Previous at the start and Next at the end", () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();

    render(
      <TablePagination
        mode="cursor"
        previousLabel="Previous"
        nextLabel="Next"
        canPrevious={false}
        canNext={false}
        onPrevious={onPrevious}
        onNext={onNext}
      />,
    );

    const previous = screen.getByRole("button", { name: "Previous" });
    const next = screen.getByRole("button", { name: "Next" });

    expect(previous.getAttribute("aria-disabled")).toBe("true");
    expect(next.getAttribute("aria-disabled")).toBe("true");

    fireEvent.click(previous);
    fireEvent.click(next);

    // A disabled control must not act, not merely look disabled.
    expect(onPrevious).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it("cursor mode fires its handlers when enabled", () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();

    render(
      <TablePagination
        mode="cursor"
        previousLabel="Previous"
        nextLabel="Next"
        canPrevious
        canNext
        onPrevious={onPrevious}
        onNext={onNext}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
