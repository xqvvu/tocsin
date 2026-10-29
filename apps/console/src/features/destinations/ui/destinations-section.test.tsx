// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createDefaultDestinationRegistry } from "@tocsin/destinations";
import larkIconUrl from "@tocsin/destinations/assets/destination-icons/lark.svg?url";
import slackIconUrl from "@tocsin/destinations/assets/destination-icons/slack.svg?url";
import webhookIconUrl from "@tocsin/destinations/assets/destination-icons/webhook.svg?url";

import type { DestinationListItem } from "#/features/destinations/ui/destination-ui-types";
import { DestinationsSection } from "#/features/destinations/ui/destinations-section";
import { AppIntlProvider } from "#/i18n/provider";

type DestinationActionHandler = (destination: DestinationListItem) => void;
type DestinationEditHandler = (destinationId: string) => void;

/** Tables without history still open a delete dialog, just without a gate. */
const noDeletionImpact = async () => ({
  eventCount: 0,
  deliveryCount: 0,
  attemptCount: 0,
  oncallPingCount: 0,
});

// The real registry catalog, so the identity column resolves the same icon
// names production ships instead of a test-only mapping.
const defaultDestinationCatalog = createDefaultDestinationRegistry().toCatalog();

// The queued-delivery and scheduled-urgent counts own their own query-state
// tests; this suite covers the table and the confirmation copy without a query
// client.
vi.mock("#/features/operations/ui/queued-deliveries-notice", () => ({
  QueuedDeliveriesNotice: () => null,
}));

vi.mock("#/features/destinations/ui/destination-scheduled-urgent-notice", () => ({
  DestinationScheduledUrgentNotice: () => null,
}));

describe("destinations section table", () => {
  afterEach(() => {
    cleanup();
  });

  it("paginates destinations inside the feature table", () => {
    const destinations = Array.from({ length: 11 }, (_, index) => destinationFixture(index + 1));

    render(
      <AppIntlProvider locale="en-US">
        <DestinationsSection
          destinations={destinations}
          destinationCatalog={defaultDestinationCatalog}
          sources={[]}
          routes={[]}
          pending={false}
          requestDeleteImpact={noDeletionImpact}
          onTest={vi.fn<DestinationActionHandler>()}
          onPreview={vi.fn<DestinationActionHandler>()}
          onEdit={vi.fn<DestinationEditHandler>()}
          onToggle={vi.fn<DestinationActionHandler>()}
          onDelete={vi.fn<DestinationActionHandler>()}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("Destination")).toBeTruthy();
    expect(screen.getByText("Configuration")).toBeTruthy();
    expect(screen.getByText("Routing")).toBeTruthy();
    expect(screen.getByText("Status")).toBeTruthy();
    expect(screen.getByText("Actions")).toBeTruthy();
    expect(screen.queryByText("Kind")).toBeNull();
    expect(screen.getByText("11 destinations")).toBeTruthy();
    expect(screen.getAllByText("https://example.test/hook").length).toBeGreaterThan(0);
    expect(screen.getByText("Destination 10")).toBeTruthy();
    expect(screen.queryByText("Destination 11")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "2" }));

    expect(screen.getByText("11 destinations")).toBeTruthy();
    expect(screen.getByText("Destination 11")).toBeTruthy();
    expect(screen.queryByText("Destination 10")).toBeNull();
  });

  it("discloses the route cascade before deleting a destination", async () => {
    const onDelete = vi.fn<DestinationActionHandler>();

    render(
      <AppIntlProvider locale="en-US">
        <DestinationsSection
          destinations={[destinationFixture(1)]}
          destinationCatalog={defaultDestinationCatalog}
          sources={[]}
          routes={[
            routeFixture("only-route", "Only route", ["destination-1"], true),
            routeFixture("shared-route", "Shared route", ["destination-1", "destination-2"], true),
            routeFixture("other-route", "Other route", ["destination-3"], true),
          ]}
          pending={false}
          requestDeleteImpact={noDeletionImpact}
          onTest={vi.fn<DestinationActionHandler>()}
          onPreview={vi.fn<DestinationActionHandler>()}
          onEdit={vi.fn<DestinationEditHandler>()}
          onToggle={vi.fn<DestinationActionHandler>()}
          onDelete={onDelete}
        />
      </AppIntlProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Destination 1" }));
    expect(onDelete).not.toHaveBeenCalled();

    const deleteDialog = screen.getByRole("alertdialog");
    expect(within(deleteDialog).getByText("This also deletes 1 route")).toBeTruthy();
    expect(within(deleteDialog).getByText("This narrows 1 route")).toBeTruthy();
    expect(await within(deleteDialog).findByText("No history will be deleted")).toBeTruthy();

    fireEvent.click(within(deleteDialog).getByRole("button", { name: "Delete destination" }));

    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "destination-1" }));
  });

  it("renders an operational empty state", () => {
    render(
      <AppIntlProvider locale="en-US">
        <DestinationsSection
          destinations={[]}
          destinationCatalog={defaultDestinationCatalog}
          sources={[]}
          routes={[]}
          pending={false}
          requestDeleteImpact={noDeletionImpact}
          onTest={vi.fn<DestinationActionHandler>()}
          onPreview={vi.fn<DestinationActionHandler>()}
          onEdit={vi.fn<DestinationEditHandler>()}
          onToggle={vi.fn<DestinationActionHandler>()}
          onDelete={vi.fn<DestinationActionHandler>()}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("No destinations configured")).toBeTruthy();
    // Nothing to paginate: the footer must not claim a page or a range.
    expect(screen.queryByText("No destinations")).toBeNull();
    expect(screen.queryByText(/Page \d+ of/)).toBeNull();
  });

  it("summarizes enabled route usage for each destination", () => {
    render(
      <AppIntlProvider locale="en-US">
        <DestinationsSection
          destinations={[destinationFixture(1), destinationFixture(2)]}
          destinationCatalog={defaultDestinationCatalog}
          sources={[]}
          routes={[
            routeFixture("route-1", "Primary paging", ["destination-1"], true),
            routeFixture("route-2", "Disabled paging", ["destination-1"], false),
            routeFixture("route-3", "Secondary paging", ["destination-2"], true),
          ]}
          pending={false}
          requestDeleteImpact={noDeletionImpact}
          onTest={vi.fn<DestinationActionHandler>()}
          onPreview={vi.fn<DestinationActionHandler>()}
          onEdit={vi.fn<DestinationEditHandler>()}
          onToggle={vi.fn<DestinationActionHandler>()}
          onDelete={vi.fn<DestinationActionHandler>()}
        />
      </AppIntlProvider>,
    );

    expect(screen.getAllByText("1 active")).toHaveLength(2);
    expect(screen.queryByText("Kind")).toBeNull();
    expect(screen.queryByText("State")).toBeNull();
  });

  it("uses destination kind assets in the identity column", () => {
    render(
      <AppIntlProvider locale="en-US">
        <DestinationsSection
          destinations={[
            destinationFixture(1, "generic_webhook"),
            destinationFixture(2, "feishu"),
            destinationFixture(3, "slack"),
            destinationFixture(4, "email"),
          ]}
          destinationCatalog={defaultDestinationCatalog}
          sources={[]}
          routes={[]}
          pending={false}
          requestDeleteImpact={noDeletionImpact}
          onTest={vi.fn<DestinationActionHandler>()}
          onPreview={vi.fn<DestinationActionHandler>()}
          onEdit={vi.fn<DestinationEditHandler>()}
          onToggle={vi.fn<DestinationActionHandler>()}
          onDelete={vi.fn<DestinationActionHandler>()}
        />
      </AppIntlProvider>,
    );

    const images = Array.from(document.querySelectorAll("tbody td:first-child img"));
    const imageSources = images.map((image) => image.getAttribute("src") ?? "");

    expect(imageSources).toContain(webhookIconUrl);
    expect(imageSources).toContain(larkIconUrl);
    expect(imageSources).toContain(slackIconUrl);
    expect(
      screen.getByText("Destination 4").closest("tr")?.querySelector("td:first-child svg"),
    ).toBeTruthy();
  });

  it("renders row actions as icon-only controls with the shared power affordance", () => {
    const onTest = vi.fn<DestinationActionHandler>();
    const onPreview = vi.fn<DestinationActionHandler>();
    const onEdit = vi.fn<DestinationEditHandler>();
    const onToggle = vi.fn<DestinationActionHandler>();
    const onDelete = vi.fn<DestinationActionHandler>();
    const destination = destinationFixture(2);

    render(
      <AppIntlProvider locale="en-US">
        <DestinationsSection
          destinations={[destination]}
          destinationCatalog={defaultDestinationCatalog}
          sources={[]}
          routes={[]}
          pending={false}
          requestDeleteImpact={noDeletionImpact}
          onTest={onTest}
          onPreview={onPreview}
          onEdit={onEdit}
          onToggle={onToggle}
          onDelete={onDelete}
        />
      </AppIntlProvider>,
    );

    expect(screen.queryByText("Test")).toBeNull();
    expect(screen.queryByText("Preview")).toBeNull();
    expect(screen.queryByText("Disable")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Test Destination 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview Destination 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit destination" }));

    const powerButton = screen.getByRole("button", { name: "Disable destination" });
    fireEvent.click(powerButton);

    expect(onTest).toHaveBeenCalledWith(destination);
    expect(onPreview).toHaveBeenCalledWith(destination);
    expect(onEdit).toHaveBeenCalledWith(destination.id);
    expect(onToggle).not.toHaveBeenCalled();
    expect(powerButton.textContent).toBe("");
    expect(powerButton.getAttribute("class")).toContain("text-destructive");
    expect(powerButton.getAttribute("class")).toContain("drop-shadow");

    const disableDialog = screen.getByRole("alertdialog");
    expect(within(disableDialog).getByText(/No enabled routes currently reference/)).toBeTruthy();
    fireEvent.click(within(disableDialog).getByRole("button", { name: "Disable destination" }));
    expect(onToggle).toHaveBeenCalledWith(destination);
  });

  it("confirms before re-enabling a disabled destination", () => {
    const onToggle = vi.fn<DestinationActionHandler>();
    // Index 1 is disabled, so the power action opens the enable confirmation.
    const destination = destinationFixture(1);

    render(
      <AppIntlProvider locale="en-US">
        <DestinationsSection
          destinations={[destination]}
          destinationCatalog={defaultDestinationCatalog}
          sources={[]}
          routes={[]}
          pending={false}
          requestDeleteImpact={noDeletionImpact}
          onTest={vi.fn<DestinationActionHandler>()}
          onPreview={vi.fn<DestinationActionHandler>()}
          onEdit={vi.fn<DestinationEditHandler>()}
          onToggle={onToggle}
          onDelete={vi.fn<DestinationActionHandler>()}
        />
      </AppIntlProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Enable destination" }));

    const enableDialog = screen.getByRole("alertdialog");
    expect(within(enableDialog).getByText("Enable destination?")).toBeTruthy();
    expect(within(enableDialog).getByText(/resumes delivery for its enabled routes/)).toBeTruthy();

    // Nothing is switched until the operator confirms.
    expect(onToggle).not.toHaveBeenCalled();

    fireEvent.click(within(enableDialog).getByRole("button", { name: "Enable destination" }));
    expect(onToggle).toHaveBeenCalledWith(destination);
  });

  it("discloses automatic urgent paging when disabling a destination", () => {
    const destination = destinationFixture(2, "feishu", {
      urgentAutoEnabled: true,
      urgentReceivers: ["ou_1", "ou_2"],
    });

    render(
      <AppIntlProvider locale="en-US">
        <DestinationsSection
          destinations={[destination]}
          destinationCatalog={defaultDestinationCatalog}
          sources={[]}
          routes={[]}
          pending={false}
          requestDeleteImpact={noDeletionImpact}
          onTest={vi.fn<DestinationActionHandler>()}
          onPreview={vi.fn<DestinationActionHandler>()}
          onEdit={vi.fn<DestinationEditHandler>()}
          onToggle={vi.fn<DestinationActionHandler>()}
          onDelete={vi.fn<DestinationActionHandler>()}
        />
      </AppIntlProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Disable destination" }));

    const disableDialog = screen.getByRole("alertdialog");
    expect(within(disableDialog).getByText("Automatic urgent paging will stop too")).toBeTruthy();
    expect(within(disableDialog).getByText(/will not call 2 receivers/)).toBeTruthy();
  });

  it("keeps the urgent paging warning off destinations without automatic paging", () => {
    const destination = destinationFixture(2, "feishu", {
      urgentAutoEnabled: false,
      urgentReceivers: ["ou_1"],
    });

    render(
      <AppIntlProvider locale="en-US">
        <DestinationsSection
          destinations={[destination]}
          destinationCatalog={defaultDestinationCatalog}
          sources={[]}
          routes={[]}
          pending={false}
          requestDeleteImpact={noDeletionImpact}
          onTest={vi.fn<DestinationActionHandler>()}
          onPreview={vi.fn<DestinationActionHandler>()}
          onEdit={vi.fn<DestinationEditHandler>()}
          onToggle={vi.fn<DestinationActionHandler>()}
          onDelete={vi.fn<DestinationActionHandler>()}
        />
      </AppIntlProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Disable destination" }));

    const disableDialog = screen.getByRole("alertdialog");
    expect(within(disableDialog).queryByText("Automatic urgent paging will stop too")).toBeNull();
  });

  it("names the alert sources that lose delivery before disabling", () => {
    render(
      <AppIntlProvider locale="en-US">
        <DestinationsSection
          destinations={[destinationFixture(2)]}
          destinationCatalog={defaultDestinationCatalog}
          sources={[
            sourceFixture("source-1", "Grafana production"),
            sourceFixture("source-2", "SigNoz staging"),
            sourceFixture("source-3", "Uptime Kuma"),
          ]}
          routes={[
            routeFixture("route-a", "Grafana route", ["destination-2"], true, [
              "source-1",
              "source-2",
            ]),
            routeFixture("route-b", "Other target", ["destination-1"], true, ["source-3"]),
          ]}
          pending={false}
          requestDeleteImpact={noDeletionImpact}
          onTest={vi.fn<DestinationActionHandler>()}
          onPreview={vi.fn<DestinationActionHandler>()}
          onEdit={vi.fn<DestinationEditHandler>()}
          onToggle={vi.fn<DestinationActionHandler>()}
          onDelete={vi.fn<DestinationActionHandler>()}
        />
      </AppIntlProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Disable destination" }));

    const disableDialog = screen.getByRole("alertdialog");
    expect(within(disableDialog).getByText("2 alert sources affected")).toBeTruthy();
    expect(
      within(disableDialog).getByText(
        "Alerts from these sources will stop reaching this destination: Grafana production, SigNoz staging",
      ),
    ).toBeTruthy();
    // The route only reaches destination-2, so its source stays out of the list.
    expect(within(disableDialog).queryByText(/Uptime Kuma/)).toBeNull();
  });

  it("discloses every alert source before deleting when a route matches all sources", () => {
    render(
      <AppIntlProvider locale="en-US">
        <DestinationsSection
          destinations={[destinationFixture(2)]}
          destinationCatalog={defaultDestinationCatalog}
          sources={[sourceFixture("source-1", "Grafana production")]}
          routes={[routeFixture("catch-all", "Catch all", ["destination-2"], true)]}
          pending={false}
          requestDeleteImpact={noDeletionImpact}
          onTest={vi.fn<DestinationActionHandler>()}
          onPreview={vi.fn<DestinationActionHandler>()}
          onEdit={vi.fn<DestinationEditHandler>()}
          onToggle={vi.fn<DestinationActionHandler>()}
          onDelete={vi.fn<DestinationActionHandler>()}
        />
      </AppIntlProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Destination 2" }));

    const deleteDialog = screen.getByRole("alertdialog");
    expect(within(deleteDialog).getByText("1 alert source affected")).toBeTruthy();
    expect(within(deleteDialog).getByText(/all sources, including ones added later/)).toBeTruthy();
  });
});

function destinationFixture(
  index: number,
  kind: DestinationListItem["kind"] = index % 2 === 0 ? "feishu" : "generic_webhook",
  operationalConfig: Partial<DestinationListItem["operationalConfig"]> = {},
): DestinationListItem {
  return {
    id: `destination-${index}`,
    name: `Destination ${index}`,
    kind,
    enabled: index % 2 === 0,
    operationalConfig: {
      endpoint: kind === "email" ? null : "https://example.test/hook",
      host: kind === "email" ? null : "example.test",
      templateConfigured: false,
      templateMode: null,
      templateSource: null,
      signingConfigured: kind === "feishu",
      method: kind === "generic_webhook" ? "POST" : null,
      to: null,
      from: null,
      replyTo: null,
      subjectPrefix: null,
      headerNames: null,
      secretFieldPaths: kind === "email" ? [] : ["webhookUrl"],
      sendMode: kind === "feishu" ? "webhook" : null,
      appRef: null,
      chatId: null,
      urgentAutoEnabled: null,
      urgentReceivers: null,
      ...operationalConfig,
    },
  };
}

function sourceFixture(id: string, name: string, enabled = true) {
  return {
    id,
    name,
    provider: "generic" as const,
    enabled,
  };
}

function routeFixture(
  id: string,
  name: string,
  destinationIds: string[],
  enabled: boolean,
  sourceIds: string[] = [],
) {
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
