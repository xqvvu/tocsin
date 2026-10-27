// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type {
  DestinationListItem,
  RouteDefinition,
  SourceSummary,
  Suppression,
} from "@tocsin/core";

import { SuppressionFromRouteDialog } from "#/features/suppressions/ui/suppression-from-route-dialog";
import { AppIntlProvider } from "#/i18n/provider";

const state = vi.hoisted(() => ({
  createSuppression: vi.fn<(input: unknown) => Promise<unknown>>(async (_input: unknown) => ({})),
  invalidateSuppressions: vi.fn<() => Promise<void>>(async () => {}),
}));

/** The instant the dialog is opened; remaining time is derived against it. */
const NOW = new Date("2026-10-27T00:30:00.000Z");

const createdSuppression: Suppression = {
  id: "suppression-created",
  name: "Silence: Critical alerts",
  kind: "silence",
  enabled: true,
  reason: null,
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
  startsAt: "2026-10-27T00:00:00.000Z",
  endsAt: "2026-10-27T02:00:00.000Z",
  createdBy: "admin@example.test",
  createdAt: "2026-10-27T00:00:00.000Z",
  updatedAt: "2026-10-27T00:00:00.000Z",
};

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, params }: { children: ReactNode; params?: { suppressionId?: string } }) => (
    <a href={`/suppressions/${params?.suppressionId ?? ""}`}>{children}</a>
  ),
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
    state.createSuppression.mockResolvedValue(createdSuppression);
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
        <AppIntlProvider locale="en-US" now={NOW}>
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

    // Success keeps the dialog on the created rule instead of closing it.
    expect(await screen.findByText("Suppression rule created")).toBeTruthy();
    expect(screen.getByText(/1h 30m remaining/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "View rule" }).getAttribute("href")).toBe(
      "/suppressions/suppression-created",
    );
    expect(screen.queryByRole("button", { name: "Create suppression" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByText("Suppression rule created")).toBeNull());
  });

  it("keeps the dialog open and shows the error when saving fails", async () => {
    state.createSuppression.mockRejectedValueOnce(new Error("config service unavailable"));

    render(
      <QueryClientProvider client={queryClient}>
        <AppIntlProvider locale="en-US" now={NOW}>
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
