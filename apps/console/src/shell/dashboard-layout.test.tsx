// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { DashboardContentLayout } from "#/shell/dashboard-layout";

describe("dashboard content layout", () => {
  afterEach(cleanup);

  it("renders page content in a single column without a side rail", () => {
    const { container } = render(<DashboardContentLayout main={<p>Deliveries content</p>} />);

    expect(screen.getByText("Deliveries content")).toBeTruthy();
    // List pages have no right rail; the layout must not reserve one.
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(container.querySelector(".grid-cols-1")).toBeTruthy();
    expect(container.innerHTML).not.toContain("xl:grid-cols");
  });

  it("shows the same single-column shell while a list route is pending", () => {
    const { container } = render(<DashboardContentLayout.Skeleton />);

    // The skeleton used to add a 360px rail that disappeared after load, so
    // every navigation to /deliveries jumped from two columns to one.
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(container.querySelector(".grid-cols-1")).toBeTruthy();
    expect(container.querySelector("table")).toBeTruthy();
  });
});
