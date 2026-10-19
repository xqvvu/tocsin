// @vitest-environment jsdom

import type { ColumnDef } from "@tanstack/react-table";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { OperationsTable } from "#/components/common/operations-table";
import type { ConsoleTableFeatures } from "#/components/common/table-features";

type Row = { id: string; name: string };

const columns: Array<ColumnDef<ConsoleTableFeatures, Row>> = [
  { id: "name", header: "Name", cell: ({ row }) => row.original.name },
];

function renderTable(data: Row[]) {
  return render(
    <OperationsTable
      data={data}
      columns={columns}
      pageSize={20}
      minWidthClassName="min-w-245"
      emptyState={<div>Nothing here</div>}
      getRowId={(row) => row.id}
      columnClassName={() => null}
      rangeLabel={({ start, end, total }) => `${start}-${end} of ${total}`}
      pageLabel={({ page, pageCount }) => `Page ${page} of ${pageCount}`}
      previousLabel="Previous"
      nextLabel="Next"
    />,
  );
}

describe("operations table", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps the table min-width but pins the empty state to the viewport", () => {
    const { container } = renderTable([]);

    // The header row keeps its width so the columns stay readable, which is
    // exactly why the empty state must not be centred in the full-width cell.
    expect(container.querySelector("table")?.className).toContain("min-w-245");

    const viewport = container.querySelector('[data-slot="empty-state-viewport"]');

    expect(viewport?.className).toContain("sticky");
    expect(viewport?.className).toContain("left-0");
    expect(viewport?.className).toContain("max-w-full");
    expect(screen.getByText("Nothing here")).toBeTruthy();
  });

  it("hides the pagination bar when there are no rows", () => {
    renderTable([]);

    expect(screen.queryByText(/Page \d+ of/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });

  it("renders the pagination bar once rows exist", () => {
    renderTable([{ id: "row-1", name: "First" }]);

    expect(screen.getByText("1-1 of 1")).toBeTruthy();
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
  });
});
