// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { FeishuAppListItem, SourceSummary } from "@tocsin/core";

import { FeishuAppsPageToolbar } from "#/features/integrations/ui/feishu-apps-page-toolbar";
import { FeishuAppsSection } from "#/features/integrations/ui/feishu-apps-section";
import { SourcesPageToolbar } from "#/features/sources/ui/sources-page-toolbar";
import { SourcesSection } from "#/features/sources/ui/sources-section";
import { AppIntlProvider } from "#/i18n/provider";

/**
 * The Feishu apps page is compared against the sources page throughout, because
 * sources is a plain list page of the same shape — a toolbar and a paginated
 * table — and is the shape the rest of the console already uses.
 *
 * These assertions are on the *rendered* result, not on which components are
 * imported. That distinction is the whole point: an earlier attempt at unifying
 * another page swapped the component while still passing props that produced a
 * visibly different control, and a component-level assertion would have passed
 * while the page still looked wrong.
 */

const noop = () => {};

const sourceFixture = {
  id: "source-1",
  name: "Grafana",
  provider: "grafana" as const,
  enabled: true,
};
const feishuAppFixture = {
  id: "app-1",
  name: "SRE pager",
  appId: "cli_abcdef123456",
  createdAt: "2026-10-13T00:00:00.000Z",
  updatedAt: "2026-10-13T00:00:00.000Z",
  referencedDestinations: [],
};

function renderWithIntl(ui: ReactNode) {
  return render(<AppIntlProvider locale="en-US">{ui}</AppIntlProvider>);
}

function sourcesSection(sources: SourceSummary[] = []) {
  return (
    <SourcesSection
      sources={sources}
      routes={[]}
      destinations={[]}
      pending={false}
      onEdit={noop}
      onToggle={noop}
      onRotateToken={noop}
      onDelete={noop}
    />
  );
}

function feishuSection(apps: FeishuAppListItem[] = []) {
  return (
    <FeishuAppsSection apps={apps} pending={false} onTest={noop} onEdit={noop} onDelete={noop} />
  );
}

describe("Feishu apps page matches the other list pages", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the same table chrome as another list page", () => {
    const { container: sources } = renderWithIntl(sourcesSection());
    const { container: feishu } = renderWithIntl(feishuSection());

    const chrome = (container: HTMLElement) => ({
      table: container.querySelectorAll("table").length,
      headCells: container.querySelectorAll("thead th").length,
      // The empty state uses the shared `Empty` primitive, which renders an icon.
      emptyStateIcon: container.querySelectorAll("svg").length > 0,
    });

    // Same shape: one table, one header cell per column, an icon-bearing empty
    // state. A hand-rolled table or a bare two-line empty block would differ here.
    expect(chrome(feishu)).toEqual(chrome(sources));
    expect(chrome(feishu).table).toBe(1);
    expect(chrome(feishu).headCells).toBe(5);
    expect(chrome(feishu).emptyStateIcon).toBe(true);
  });

  it("renders the same pagination footer as another list page", () => {
    // A list with no rows has nothing to paginate and hides the footer, so the
    // parity check needs one row in each table.
    const { container: sources } = renderWithIntl(sourcesSection([sourceFixture]));
    const { container: feishu } = renderWithIntl(feishuSection([feishuAppFixture]));

    // Read the shared footer itself rather than the whole page, so table cell
    // content cannot leak into the comparison.
    const footer = (container: HTMLElement) =>
      container.querySelector('[data-slot="table-pagination"]')?.textContent ?? "";
    // The range label legitimately differs by noun; the control itself must not.
    const pageControl = (container: HTMLElement) => {
      const text = footer(container);

      return text.slice(text.indexOf("Page "));
    };

    // Page label, Previous and Next all present — i.e. the shared numbered
    // control, which is what makes the footer identical across list pages.
    expect(pageControl(feishu)).toContain("Page 1 / 1");
    expect(pageControl(feishu)).toContain("Previous");
    expect(pageControl(feishu)).toContain("Next");
    expect(pageControl(feishu)).toBe(pageControl(sources));

    // The range label is part of the same footer and legitimately differs by
    // noun, so assert it separately rather than skipping it: dropping it would
    // leave a footer that renders only arrows, which is the exact regression
    // this page needed fixing for.
    const rangeLabel = (container: HTMLElement) => footer(container).split("Page ")[0];

    expect(rangeLabel(feishu)).toBe("1 Feishu apps");
    expect(rangeLabel(sources)).toBe("1 sources");
  });

  it("renders its own columns, so the table is not merely structurally identical", () => {
    const { container } = renderWithIntl(feishuSection());

    // Guards against "unifying" by rendering the wrong table entirely: the
    // headers must be the Feishu ones.
    const headers = Array.from(container.querySelectorAll("thead th")).map(
      (cell) => cell.textContent,
    );

    expect(headers).toEqual(["Name", "App ID", "Referenced by", "Updated", "Actions"]);
  });

  it("keeps its actionable columns, so unification did not drop functionality", () => {
    const { container } = renderWithIntl(feishuSection());

    // The actions column exists as a real column (5 headers above); assert the
    // empty state did not swallow the table.
    expect(container.querySelector("table")).not.toBeNull();
  });
});

describe("Feishu apps page header matches the other list pages", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the same header shape as another list page", () => {
    const { container: sources } = renderWithIntl(
      <SourcesPageToolbar actions={<button type="button">Action</button>} />,
    );
    const { container: feishu } = renderWithIntl(
      <FeishuAppsPageToolbar actions={<button type="button">Action</button>} />,
    );

    const header = (container: HTMLElement) => ({
      headers: container.querySelectorAll("header").length,
      // The shell no longer renders the page name; every list page owns its
      // `<h1>` in the toolbar, so both pages must have exactly one heading.
      headings: container.querySelectorAll("h1").length,
      descriptions: container.querySelectorAll("p").length,
    });

    expect(header(feishu)).toEqual(header(sources));
    expect(header(feishu).headings).toBe(1);
  });
});
