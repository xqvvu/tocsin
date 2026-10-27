// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { DestinationListItem, EventRecord, SourceSummary, Suppression } from "@tocsin/core";

import { SuppressionFromEventDialog } from "#/features/suppressions/ui/suppression-from-event-dialog";
import { AppIntlProvider } from "#/i18n/provider";

const state = vi.hoisted(() => ({
  createSuppression: vi.fn<(input: unknown) => Promise<unknown>>(async (_input: unknown) => ({})),
  invalidateSuppressions: vi.fn<() => Promise<void>>(async () => {}),
}));

/** The instant the dialog is opened; remaining time is derived against it. */
const NOW = new Date("2026-10-27T00:30:00.000Z");

const source: SourceSummary = {
  id: "source-grafana",
  name: "Grafana",
  provider: "grafana",
  enabled: true,
};

const destinations: DestinationListItem[] = [destinationFixture()];

const event: EventRecord = {
  id: "event-1",
  sourceId: source.id,
  idempotencyKey: null,
  normalized: {
    title: "Disk full",
    message: "Disk usage above 95%",
    severity: "critical",
    status: "firing",
    fingerprint: "disk-full",
    labels: {},
    occurredAt: "2026-10-27T00:00:00.000Z",
  },
  providerMetadata: {},
  rawPayload: {},
  rawHeaders: {},
  routeMatches: null,
  receivedAt: "2026-10-27T00:00:01.000Z",
};

const createdSuppression: Suppression = {
  id: "suppression-created",
  name: "Silence: Disk full",
  kind: "silence",
  enabled: true,
  reason: null,
  matcher: {
    sourceIds: ["source-grafana"],
    destinationIds: [],
    severities: [],
    statuses: [],
    fingerprints: ["disk-full"],
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

vi.mock("#/features/sources/api/source.queries", () => ({
  sourcesQueryOptions: () => ({
    queryKey: ["test", "sources"],
    queryFn: async () => [source],
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

describe("suppression from event dialog", () => {
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

  it("keeps the created rule, its window, and a link after silencing the fingerprint", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AppIntlProvider locale="en-US" now={NOW}>
          <SuppressionFromEventDialog event={event} source={source} />
        </AppIntlProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Silence fingerprint" }));
    await screen.findByRole("checkbox", { name: "Ops group" });
    fireEvent.click(screen.getByRole("button", { name: "Create suppression" }));

    await waitFor(() => expect(state.createSuppression).toHaveBeenCalledOnce());
    expect(await screen.findByText("Suppression rule created")).toBeTruthy();
    expect(screen.getByText(/1h 30m remaining/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "View rule" }).getAttribute("href")).toBe(
      "/suppressions/suppression-created",
    );
    expect(screen.queryByRole("button", { name: "Create suppression" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByText("Suppression rule created")).toBeNull());
  });
});

function destinationFixture(): DestinationListItem {
  return {
    id: "destination-ops",
    name: "Ops group",
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
