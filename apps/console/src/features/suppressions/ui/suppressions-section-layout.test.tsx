// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { SuppressionsSection } from "#/features/suppressions/ui/suppressions-section";
import { AppIntlProvider } from "#/i18n/provider";

const noop = () => {};

describe("suppressions section layout", () => {
  afterEach(() => cleanup());

  it("fills the remaining dashboard height like the routes table", () => {
    const { container } = render(
      <AppIntlProvider locale="en-US">
        <div className="flex h-dvh flex-col">
          <SuppressionsSection
            suppressions={[]}
            sources={[]}
            destinations={[]}
            editingSuppression={null}
            pending={false}
            onEdit={noop}
            onCancelEdit={noop}
            onToggle={noop}
            onDelete={noop}
            onSubmitEdit={noop}
          />
        </div>
      </AppIntlProvider>,
    );

    const section = container.querySelector("section.bg-background");
    const table = container.querySelector("table");
    const tableRegion = table?.parentElement?.parentElement;

    // OperationsTable is already flex-1/min-h-0. The feature wrapper must also
    // participate in the flex chain, or the table shrink-wraps to its rows and
    // leaves an unused blank area above the dashboard footer.
    expect(section?.className).toContain("flex-1");
    expect(section?.className).toContain("min-h-0");
    expect(section?.className).toContain("flex-col");
    expect(tableRegion?.className).toContain("flex-1");
    expect(tableRegion?.className).toContain("min-h-0");
  });
});
