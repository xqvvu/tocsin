// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { DestinationListItem } from "@tocsin/core";

import { DestinationEditDialog } from "#/features/destinations/ui/destination-edit-dialog";
import { AppIntlProvider } from "#/i18n/provider";

const testState = vi.hoisted(() => ({
  queued: 2,
}));

vi.mock("#/features/destinations/api/destination.queries", () => ({
  destinationTemplateDraftQueryOptions: () => ({
    queryKey: ["test", "destination-template-draft"],
    queryFn: async () => ({}),
  }),
}));

vi.mock("#/features/destinations/api/destination.mutations", () => ({
  useDestinationMutations: () => ({
    invalidateDestinations: async () => {},
    updateDestination: async () => ({}),
  }),
}));

vi.mock("#/features/destinations/ui/edit-destination-form", () => {
  function EditDestinationFormStub() {
    return <p>destination form</p>;
  }

  return {
    EditDestinationForm: Object.assign(EditDestinationFormStub, {
      Skeleton: () => <p>destination form skeleton</p>,
    }),
  };
});

vi.mock("#/features/operations/api/operations.queries", () => ({
  pendingDeliveriesQueryOptions: (scope: unknown) => ({
    queryKey: ["test", "pending-deliveries", scope],
    queryFn: async () => ({ deliveries: { total: testState.queued } }),
    staleTime: Infinity,
  }),
}));

const destination: DestinationListItem = {
  id: "destination-1",
  name: "Ops webhook",
  kind: "generic_webhook",
  enabled: true,
  operationalConfig: {
    endpoint: "https://example.test/hook",
    host: "example.test",
    method: "POST",
    to: null,
    from: null,
    replyTo: null,
    subjectPrefix: null,
    headerNames: null,
    templateConfigured: false,
    templateMode: null,
    templateSource: null,
    signingConfigured: false,
    secretFieldPaths: ["webhookUrl"],
    sendMode: null,
    appRef: null,
    chatId: null,
    urgentAutoEnabled: null,
    urgentReceivers: null,
  },
};

describe("destination edit dialog queued delivery impact", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    testState.queued = 2;
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  function renderDialog() {
    return render(
      <QueryClientProvider client={queryClient}>
        <AppIntlProvider locale="en-US">
          <DestinationEditDialog
            destinationCatalog={[]}
            feishuApps={[]}
            destination={destination}
            open
            onOpenChange={() => {}}
            onPreview={() => null}
          />
        </AppIntlProvider>
      </QueryClientProvider>,
    );
  }

  it("warns that queued deliveries pick up the saved configuration", async () => {
    renderDialog();

    expect(
      await screen.findByText(
        "Queued deliveries read the configuration saved here when they are sent — endpoint, template, headers and signing — so saving applies the new configuration to them",
      ),
    ).toBeTruthy();
    expect(screen.getByText("2 queued deliveries")).toBeTruthy();
  });

  it("stays silent when nothing is queued", async () => {
    testState.queued = 0;

    const { container } = renderDialog();

    await waitFor(() => {
      expect(screen.getByText("destination form")).toBeTruthy();
    });
    expect(container.textContent).not.toContain("queued deliver");
  });
});
