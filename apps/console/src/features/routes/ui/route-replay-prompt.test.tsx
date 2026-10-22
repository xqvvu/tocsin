// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { DestinationListItem, RouteReplayPreview } from "@tocsin/core";

import { RouteReplayPrompt } from "#/features/routes/ui/route-replay-prompt";
import { AppIntlProvider } from "#/i18n/provider";

const state = vi.hoisted(() => ({
  preview: null as RouteReplayPreview | null,
  replayRouteEvents: vi.fn<() => Promise<unknown>>(async () => null),
  invalidateOperations: vi.fn<() => Promise<void>>(async () => {}),
}));

const destinations: DestinationListItem[] = [
  destinationFixture({ id: "destination-ops", name: "Ops group" }),
];

vi.mock("#/features/operations/api/operations.queries", () => ({
  operationsQueryKeys: {
    routeReplayPreview: (id: string) => ["test", "routeReplayPreview", id],
  },
  routeReplayPreviewQueryOptions: (routeId: string) => ({
    queryKey: ["test", "routeReplayPreview", routeId],
    queryFn: async () => state.preview,
  }),
}));

vi.mock("#/features/operations/api/operation.mutations", () => ({
  useOperationMutations: () => ({
    replayRouteEvents: state.replayRouteEvents,
    invalidateOperations: state.invalidateOperations,
  }),
}));

vi.mock("#/features/destinations/api/destination.queries", () => ({
  destinationsQueryOptions: () => ({
    queryKey: ["test", "destinations"],
    queryFn: async () => destinations,
  }),
}));

vi.mock("#/features/configuration/api/configuration.queries", () => ({
  appSettingsQueryOptions: () => ({
    queryKey: ["test", "settings"],
    queryFn: async () => ({ deliveryPaused: false }),
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn<() => void>(), success: vi.fn<() => void>() },
}));

describe("route replay prompt", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    state.preview = {
      routeId: "route-1",
      routeName: "Critical checkout",
      enabled: true,
      limit: 20,
      scannedEventCount: 20,
      matchedEventCount: 12,
      candidates: Array.from({ length: 12 }, (_, index) => ({
        event: {
          id: `event-${index + 1}`,
          sourceId: "source-1",
          sourceName: "Grafana",
          severity: "critical" as const,
          status: "firing" as const,
          title: `Alert ${index + 1}`,
          fingerprint: `fingerprint-${index + 1}`,
          receivedAt: "2026-10-22T06:00:00.000Z",
        },
        targets: [
          {
            routeId: "route-1",
            routeName: "Critical checkout",
            destinationId: "destination-ops",
            deliveryId: null,
            alreadyExists: false,
          },
        ],
        newDeliveryCount: 1,
        existingDeliveryCount: 0,
      })),
      newDeliveryCount: 12,
      existingDeliveryCount: 0,
    };
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    state.replayRouteEvents.mockClear();
    state.invalidateOperations.mockClear();
  });

  it("renders every candidate and the targets each replay will create", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AppIntlProvider locale="en-US">
          <RouteReplayPrompt routeId="route-1" onClose={() => {}} />
        </AppIntlProvider>
      </QueryClientProvider>,
    );

    // The preview used to stop at ten rows while confirming all candidates.
    expect(await screen.findByText("Alert 12")).toBeTruthy();
    expect(screen.getByText("Alert 1")).toBeTruthy();
    expect(await screen.findAllByText("Ops group")).toHaveLength(12);
    expect(screen.getAllByText("New targets")).toHaveLength(12);
    expect(
      screen.getByText("All 12 candidates above will be replayed after confirmation"),
    ).toBeTruthy();
  });
});

function destinationFixture(overrides: { id: string; name: string }): DestinationListItem {
  return {
    id: overrides.id,
    name: overrides.name,
    kind: "generic_webhook",
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
      sendMode: null,
      appRef: null,
      chatId: null,
      urgentAutoEnabled: null,
      urgentReceivers: null,
    },
  };
}
