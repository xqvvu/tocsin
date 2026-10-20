// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DestinationEditDialog } from "#/features/destinations/ui/destination-edit-dialog";

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

vi.mock("#/i18n/use-i18n", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("destination edit dialog load states", () => {
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
  });

  function renderDialog(props: {
    loading?: boolean;
    loadError?: string | null;
    onRetryLoad?: () => void;
  }) {
    return render(
      <QueryClientProvider client={queryClient}>
        <DestinationEditDialog
          destinationCatalog={[]}
          feishuApps={[]}
          destination={null}
          open
          loading={props.loading}
          loadError={props.loadError}
          onOpenChange={() => {}}
          onRetryLoad={props.onRetryLoad}
          onPreview={() => null}
        />
      </QueryClientProvider>,
    );
  }

  it("explains a deleted destination instead of leaving the dialog blank", () => {
    renderDialog({});

    expect(screen.getByText("destinations.form.edit.notFoundTitle")).toBeTruthy();
    expect(screen.getByText("destinations.form.edit.notFoundDescription")).toBeTruthy();
  });

  it("offers a retry when the destination could not be loaded", () => {
    const retry = vi.fn();

    renderDialog({ loadError: "config service unavailable", onRetryLoad: retry });

    expect(screen.getByText("destinations.form.edit.loadFailedTitle")).toBeTruthy();
    expect(screen.getByText("config service unavailable")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "common.actions.retry" }));

    expect(retry).toHaveBeenCalledOnce();
  });

  it("shows a skeleton while the caller is still loading", () => {
    renderDialog({ loading: true });

    expect(screen.queryByText("destinations.form.edit.notFoundTitle")).toBeNull();
    expect(document.querySelector('[data-slot="skeleton"]')).not.toBeNull();
  });
});
