// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { DestinationListItem, RouteDefinition, SourceSummary } from "@tocsin/core";

import { SuppressionFromRouteDialog } from "#/features/suppressions/ui/suppression-from-route-dialog";
import { AppIntlProvider } from "#/i18n/provider";

const state = vi.hoisted(() => ({
  createSuppression: vi.fn<(input: unknown) => Promise<unknown>>(async (_input: unknown) => ({})),
  invalidateSuppressions: vi.fn<() => Promise<void>>(async () => {}),
}));

const sources: SourceSummary[] = [
  { id: "source-grafana", name: "Grafana", provider: "grafana", enabled: true },
];

const destinations: DestinationListItem[] = [
  destinationFixture({ id: "destination-ops", name: "Ops group" }),
  destinationFixture({ id: "destination-audit", name: "Audit channel" }),
];

const route: RouteDefinition = {
  id: "route-critical",
  name: "Critical alerts",
  enabled: true,
  rule: {
    sourceIds: ["source-grafana"],
    severities: ["critical"],
    statuses: [],
    labels: [],
    titleContains: [],
    messageContains: [],
  },
  destinationIds: ["destination-ops"],
};

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
  toast: { error: vi.fn<() => void>(), success: vi.fn<() => void>() },
}));

describe("suppression from route dialog", () => {
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

  it("prefills the route's rule and targets and saves a route-scoped rule", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AppIntlProvider locale="en-US">
          <SuppressionFromRouteDialog route={route} />
        </AppIntlProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Silence Critical alerts temporarily" }));

    // The route's own target is pinned; an unrelated target stays out of scope.
    const opsCheckbox = await screen.findByRole("checkbox", { name: "Ops group" });
    const auditCheckbox = screen.getByRole("checkbox", { name: "Audit channel" });

    expect(opsCheckbox.getAttribute("aria-checked")).toBe("true");
    expect(auditCheckbox.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Route Critical alerts · targets: 1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Create suppression" }));

    await waitFor(() => expect(state.createSuppression).toHaveBeenCalledOnce());

    expect(state.createSuppression.mock.calls[0]?.[0]).toMatchObject({
      name: "Silence: Critical alerts",
      kind: "silence",
      enabled: true,
      matcher: {
        sourceIds: ["source-grafana"],
        destinationIds: ["destination-ops"],
        severities: ["critical"],
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
          <SuppressionFromRouteDialog route={route} />
        </AppIntlProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Silence Critical alerts temporarily" }));
    await screen.findByRole("checkbox", { name: "Ops group" });
    fireEvent.click(screen.getByRole("button", { name: "Create suppression" }));

    await waitFor(() => expect(state.createSuppression).toHaveBeenCalledOnce());
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
