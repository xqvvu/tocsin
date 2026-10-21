// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { DestinationListItem, SourceSummary } from "@tocsin/core";

import { SuppressionFromDestinationDialog } from "#/features/suppressions/ui/suppression-from-destination-dialog";
import { AppIntlProvider } from "#/i18n/provider";

const state = vi.hoisted(() => ({
  createSuppression: vi.fn(async (_input: unknown) => ({})),
  invalidateSuppressions: vi.fn(async () => {}),
}));

const sources: SourceSummary[] = [
  { id: "source-grafana", name: "Grafana", provider: "grafana", enabled: true },
];

const destinations: DestinationListItem[] = [
  destinationFixture({ id: "destination-ops", name: "Ops group" }),
  destinationFixture({ id: "destination-audit", name: "Audit channel" }),
];

vi.mock("#/features/sources/api/source.queries", () => ({
  sourcesQueryOptions: () => ({
    queryKey: ["test", "sources"],
    queryFn: async () => sources,
  }),
}));

vi.mock("#/features/destinations/api/destination.queries", () => ({
  destinationsQueryOptions: () => ({
    queryKey: ["test", "destinations"],
    queryFn: async () => destinations,
  }),
}));

vi.mock("#/features/suppressions/api/suppression.mutations", () => ({
  useSuppressionMutations: () => ({
    createSuppression: state.createSuppression,
    invalidateSuppressions: state.invalidateSuppressions,
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe("suppression from destination dialog", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    state.createSuppression.mockClear();
    state.invalidateSuppressions.mockClear();
  });

  it("prefills only the row's destination and saves a target-scoped rule", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AppIntlProvider locale="en-US">
          <SuppressionFromDestinationDialog destination={destinations[0]!} />
        </AppIntlProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Silence Ops group temporarily" }));

    const opsCheckbox = await screen.findByRole("checkbox", { name: "Ops group" });
    const auditCheckbox = screen.getByRole("checkbox", { name: "Audit channel" });

    expect(opsCheckbox.getAttribute("aria-checked")).toBe("true");
    expect(auditCheckbox.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Create suppression" }));

    await waitFor(() => expect(state.createSuppression).toHaveBeenCalledOnce());

    expect(state.createSuppression.mock.calls[0]?.[0]).toMatchObject({
      name: "Silence: Ops group",
      kind: "silence",
      enabled: true,
      matcher: {
        sourceIds: [],
        destinationIds: ["destination-ops"],
        severities: [],
        statuses: [],
        fingerprints: [],
        labels: [],
        titleContains: [],
        messageContains: [],
      },
    });
    await waitFor(() => expect(state.invalidateSuppressions).toHaveBeenCalledOnce());
  });

  it("keeps the dialog open and shows the error when saving fails", async () => {
    state.createSuppression.mockRejectedValueOnce(new Error("config service unavailable"));

    render(
      <QueryClientProvider client={queryClient}>
        <AppIntlProvider locale="en-US">
          <SuppressionFromDestinationDialog destination={destinations[0]!} />
        </AppIntlProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Silence Ops group temporarily" }));
    await screen.findByRole("checkbox", { name: "Ops group" });
    fireEvent.click(screen.getByRole("button", { name: "Create suppression" }));

    await waitFor(() => expect(state.createSuppression).toHaveBeenCalledOnce());
    // The form and its prefilled matcher stay mounted so the operator can retry.
    expect(screen.getByRole("checkbox", { name: "Ops group" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(state.invalidateSuppressions).not.toHaveBeenCalled();
  });
});

function destinationFixture(overrides: { id: string; name: string }): DestinationListItem {
  return {
    id: overrides.id,
    name: overrides.name,
    kind: "feishu",
    enabled: true,
    operationalConfig: {
      endpoint: null,
      host: null,
      method: null,
      to: null,
      from: null,
      replyTo: null,
      subjectPrefix: null,
      headerNames: null,
      templateConfigured: false,
      templateMode: null,
      templateSource: null,
      signingConfigured: false,
      secretFieldPaths: [],
      sendMode: "app",
      appRef: null,
      chatId: null,
      urgentAutoEnabled: false,
      urgentReceivers: [],
    },
  };
}
