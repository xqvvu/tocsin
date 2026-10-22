// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { DestinationListItem, EventReplayPreview } from "@tocsin/core";

import { EventReplayAction } from "#/features/events/ui/event-replay-action";
import { AppIntlProvider } from "#/i18n/provider";

const state = vi.hoisted(() => ({
  preview: null as EventReplayPreview | null,
  replayEvent: vi.fn<() => Promise<unknown>>(async () => null),
  invalidateOperations: vi.fn<() => Promise<void>>(async () => {}),
}));

const destinations: DestinationListItem[] = [
  destinationFixture({ id: "destination-ops", name: "Ops group" }),
  destinationFixture({ id: "destination-audit", name: "Audit channel" }),
];

vi.mock("#/features/operations/api/operations.queries", () => ({
  operationsQueryKeys: {
    eventDetail: (id: string) => ["test", "eventDetail", id],
    eventReplayPreview: (id: string) => ["test", "eventReplayPreview", id],
  },
  eventReplayPreviewQueryOptions: (eventId: string) => ({
    queryKey: ["test", "eventReplayPreview", eventId],
    queryFn: async () => state.preview,
  }),
}));

vi.mock("#/features/operations/api/operation.mutations", () => ({
  useOperationMutations: () => ({
    replayEvent: state.replayEvent,
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

describe("event replay action", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    state.preview = {
      eventId: "event-1",
      routeMatches: [],
      targets: [
        {
          routeId: "route-1",
          routeName: "Critical checkout",
          destinationId: "destination-ops",
          deliveryId: null,
          alreadyExists: false,
        },
        {
          routeId: "route-1",
          routeName: "Critical checkout",
          destinationId: "destination-audit",
          deliveryId: "delivery-9",
          alreadyExists: true,
        },
        {
          routeId: "route-2",
          routeName: "Billing warnings",
          destinationId: "destination-removed",
          deliveryId: null,
          alreadyExists: false,
        },
      ],
      matchedRouteCount: 2,
      newDeliveryCount: 2,
      existingDeliveryCount: 1,
    };
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    state.replayEvent.mockClear();
    state.invalidateOperations.mockClear();
  });

  it("lists every target with its destination name and creation state", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AppIntlProvider locale="en-US">
          <EventReplayAction eventId="event-1" />
        </AppIntlProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Replay" }));

    expect(await screen.findByText("Destination: Ops group")).toBeTruthy();
    expect(screen.getByText("Destination: Audit channel")).toBeTruthy();
    // A target whose destination has been deleted still shows what will happen.
    expect(screen.getByText("Destination: destination-removed")).toBeTruthy();
    expect(screen.getAllByText("New")).toHaveLength(2);
    expect(screen.getAllByText("Exists")).toHaveLength(1);
    expect(screen.getAllByText("Critical checkout")).toHaveLength(2);
    expect(screen.getByText("Delivery targets")).toBeTruthy();
  });

  it("hides the target list when no route target matches", async () => {
    state.preview = {
      eventId: "event-1",
      routeMatches: [],
      targets: [],
      matchedRouteCount: 0,
      newDeliveryCount: 0,
      existingDeliveryCount: 0,
    };

    render(
      <QueryClientProvider client={queryClient}>
        <AppIntlProvider locale="en-US">
          <EventReplayAction eventId="event-1" />
        </AppIntlProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Replay" }));

    expect(await screen.findByText("No enabled route currently matches this event")).toBeTruthy();
    expect(screen.queryByText("Delivery targets")).toBeNull();
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
