// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { SourceSummary } from "#/features/sources/ui/source-ui-types";
import { SourcesSection } from "#/features/sources/ui/sources-section";
import { AppIntlProvider } from "#/i18n/provider";

type RouteSummary = ComponentProps<typeof SourcesSection>["routes"][number];
type DestinationSummary = ComponentProps<typeof SourcesSection>["destinations"][number];
type SourceActionHandler = (source: SourceSummary) => void;
type SourceEditHandler = (sourceId: string) => void;

vi.mock("#/lib/browser", () => ({
  copyText: vi.fn<() => Promise<boolean>>(async () => true),
  urlFromCurrentOrigin: (path: string) => `http://localhost${path}`,
}));

describe("sources section table", () => {
  afterEach(() => {
    cleanup();
  });

  it("paginates sources inside the table panel", () => {
    const sources = Array.from({ length: 12 }, (_, index) => sourceFixture(index + 1));

    render(
      <AppIntlProvider locale="en-US">
        <SourcesSection
          sources={sources}
          routes={[]}
          destinations={[]}
          pending={false}
          onEdit={vi.fn<SourceEditHandler>()}
          onToggle={vi.fn<SourceActionHandler>()}
          onRotateToken={vi.fn<SourceActionHandler>()}
          onDelete={vi.fn<SourceActionHandler>()}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("12 sources")).toBeTruthy();
    expect(screen.getByText("Source 10")).toBeTruthy();
    expect(screen.queryByText("Source 11")).toBeNull();

    expect(screen.getByRole("button", { name: "1" }).getAttribute("aria-current")).toBe("page");

    fireEvent.click(screen.getByRole("button", { name: "2" }));

    expect(screen.getByText("12 sources")).toBeTruthy();
    expect(screen.getByText("Source 11")).toBeTruthy();
    expect(screen.getByText("Source 12")).toBeTruthy();
    expect(screen.queryByText("Source 10")).toBeNull();
    expect(screen.getByRole("button", { name: "2" }).getAttribute("aria-current")).toBe("page");
  });

  it("summarizes enabled route coverage instead of static auth placeholders", () => {
    render(
      <AppIntlProvider locale="en-US">
        <SourcesSection
          sources={[sourceFixture(1), sourceFixture(2)]}
          routes={[
            routeFixture("direct-route", "Direct route", ["source-1"], true),
            routeFixture("catch-all-route", "Catch all route", [], true),
            routeFixture("disabled-route", "Disabled route", ["source-1"], false),
          ]}
          destinations={[destinationFixture("destination-1", true)]}
          pending={false}
          onEdit={vi.fn<SourceEditHandler>()}
          onToggle={vi.fn<SourceActionHandler>()}
          onRotateToken={vi.fn<SourceActionHandler>()}
          onDelete={vi.fn<SourceActionHandler>()}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("Intake")).toBeTruthy();
    expect(screen.getByText("Routes")).toBeTruthy();
    expect(screen.queryByText("Auth")).toBeNull();
    expect(screen.queryByText("Last received")).toBeNull();
    expect(screen.queryByText("Token configured")).toBeNull();
    expect(screen.getByText("2 deliverable")).toBeTruthy();
    expect(screen.getByText("1 deliverable")).toBeTruthy();
  });

  it("warns when every matching route has all destinations disabled", () => {
    render(
      <AppIntlProvider locale="en-US">
        <SourcesSection
          sources={[sourceFixture(2)]}
          routes={[
            routeFixture("direct-route", "Direct route", ["source-2"], true),
            routeFixture("catch-all-route", "Catch all route", [], true),
          ]}
          destinations={[destinationFixture("destination-1", false)]}
          pending={false}
          onEdit={vi.fn<SourceEditHandler>()}
          onToggle={vi.fn<SourceActionHandler>()}
          onRotateToken={vi.fn<SourceActionHandler>()}
          onDelete={vi.fn<SourceActionHandler>()}
        />
      </AppIntlProvider>,
    );

    const badge = screen.getByText("All targets off");
    expect(badge.getAttribute("title")).toContain("every linked destination is disabled");
    expect(badge.getAttribute("title")).toContain("Direct route, Catch all route");
  });

  it("shows the deliverable count and names blocked routes when only some are blocked", () => {
    render(
      <AppIntlProvider locale="en-US">
        <SourcesSection
          sources={[sourceFixture(2)]}
          routes={[
            routeFixture("healthy-route", "Healthy route", ["source-2"], true, ["destination-on"]),
            routeFixture("blocked-route", "Blocked route", ["source-2"], true, ["destination-off"]),
          ]}
          destinations={[
            destinationFixture("destination-on", true),
            destinationFixture("destination-off", false),
          ]}
          pending={false}
          onEdit={vi.fn<SourceEditHandler>()}
          onToggle={vi.fn<SourceActionHandler>()}
          onRotateToken={vi.fn<SourceActionHandler>()}
          onDelete={vi.fn<SourceActionHandler>()}
        />
      </AppIntlProvider>,
    );

    const badge = screen.getByText("1 deliverable");
    expect(badge.getAttribute("title")).toContain("1 have no enabled destination");
    expect(badge.getAttribute("title")).toContain("Blocked route");
  });

  it("asks for confirmation before disabling a source and reports enabled route impact", () => {
    const onToggle = vi.fn<SourceActionHandler>();

    render(
      <AppIntlProvider locale="en-US">
        <SourcesSection
          sources={[sourceFixture(2)]}
          routes={[
            routeFixture("direct-route", "Direct route", ["source-2"], true),
            routeFixture("catch-all-route", "Catch all route", [], true),
            routeFixture("disabled-route", "Disabled route", ["source-2"], false),
          ]}
          destinations={[destinationFixture("destination-1", true)]}
          pending={false}
          onEdit={vi.fn<SourceEditHandler>()}
          onToggle={onToggle}
          onRotateToken={vi.fn<SourceActionHandler>()}
          onDelete={vi.fn<SourceActionHandler>()}
        />
      </AppIntlProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Disable source intake" }));
    expect(onToggle).not.toHaveBeenCalled();

    const disableDialog = screen.getByRole("alertdialog");
    expect(
      within(disableDialog).getByText(/2 enabled routes will stop receiving new events/),
    ).toBeTruthy();
    fireEvent.click(within(disableDialog).getByRole("button", { name: "Disable intake" }));

    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: "source-2" }));
  });

  it("enables a disabled source without a confirmation step", () => {
    const onToggle = vi.fn<SourceActionHandler>();

    render(
      <AppIntlProvider locale="en-US">
        <SourcesSection
          sources={[sourceFixture(1)]}
          routes={[]}
          destinations={[]}
          pending={false}
          onEdit={vi.fn<SourceEditHandler>()}
          onToggle={onToggle}
          onRotateToken={vi.fn<SourceActionHandler>()}
          onDelete={vi.fn<SourceActionHandler>()}
        />
      </AppIntlProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Enable source intake" }));

    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: "source-1" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

function sourceFixture(index: number): SourceSummary {
  return {
    id: `source-${index}`,
    name: `Source ${index}`,
    provider: "generic",
    enabled: index % 2 === 0,
  };
}

function routeFixture(
  id: string,
  name: string,
  sourceIds: string[],
  enabled: boolean,
  destinationIds: string[] = ["destination-1"],
): RouteSummary {
  return {
    id,
    name,
    enabled,
    rule: {
      sourceIds,
      severities: [],
      statuses: [],
      labels: [],
      titleContains: [],
      messageContains: [],
    },
    destinationIds,
  };
}

function destinationFixture(id: string, enabled: boolean): DestinationSummary {
  return {
    id,
    name: id,
    kind: "generic_webhook",
    enabled,
  };
}
