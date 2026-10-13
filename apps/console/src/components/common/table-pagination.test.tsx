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
});
