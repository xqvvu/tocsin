// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { DestinationListItem, SourceSummary, Suppression } from "@tocsin/core";

import { SuppressionFromDestinationDialog } from "#/features/suppressions/ui/suppression-from-destination-dialog";
import { AppIntlProvider } from "#/i18n/provider";

const state = vi.hoisted(() => ({
  createSuppression: vi.fn(async (_input: unknown) => ({})),
  invalidateSuppressions: vi.fn(async () => {}),
}));

/** The instant the dialog is opened; remaining time is derived against it. */
const NOW = new Date("2026-10-27T00:30:00.000Z");

const createdSuppression: Suppression = {
  id: "suppression-created",
  name: "Silence: Ops group",
  kind: "silence",
  enabled: true,
  reason: null,
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
    state.createSuppression.mockResolvedValue(createdSuppression);
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
        <AppIntlProvider locale="en-US" now={NOW}>
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

    // Success keeps the dialog on the created rule instead of closing it.
    expect(await screen.findByText("Suppression rule created")).toBeTruthy();
    expect(screen.getByText(/1h 30m remaining/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "View rule" }).getAttribute("href")).toBe(
      "/suppressions/suppression-created",
    );

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByText("Suppression rule created")).toBeNull());
  });

  it("keeps the dialog open and shows the error when saving fails", async () => {
    state.createSuppression.mockRejectedValueOnce(new Error("config service unavailable"));

    render(
      <QueryClientProvider client={queryClient}>
        <AppIntlProvider locale="en-US" now={NOW}>
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
