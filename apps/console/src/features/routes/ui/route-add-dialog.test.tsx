// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { DestinationSummary, RouteDefinition, SourceSummary } from "@tocsin/core";

import { RouteAddDialog } from "#/features/routes/ui/route-add-dialog";
import { AppIntlProvider } from "#/i18n/provider";

vi.mock("#/features/operations/api/operations.queries", () => ({
  pendingDeliveriesQueryOptions: (scope: unknown) => ({
    queryKey: ["test", "pending-deliveries", scope],
    queryFn: async () => ({ deliveries: { total: 0 } }),
    staleTime: Infinity,
  }),
}));

const sources: SourceSummary[] = [
  { id: "source-grafana", name: "Grafana", provider: "grafana", enabled: true },
];

const destinations: DestinationSummary[] = [
  { id: "destination-ops", name: "Ops Webhook", kind: "generic_webhook", enabled: true },
];

type CreateRouteInput = {
  name: string;
  rule: RouteDefinition["rule"];
  destinationIds: string[];
};

function renderDialog(onSubmit: (input: CreateRouteInput) => boolean | Promise<boolean>): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <AppIntlProvider locale="en-US">
        <RouteAddDialog
          sources={sources}
          destinations={destinations}
          pending={false}
          onSubmit={onSubmit}
        />
      </AppIntlProvider>
    </QueryClientProvider>,
  );
}

async function openAndFillForm(name: string): Promise<HTMLInputElement> {
  fireEvent.click(screen.getByRole("button", { name: "Add" }));

  const nameInput = (await screen.findByLabelText("Name")) as HTMLInputElement;
  fireEvent.change(nameInput, { target: { value: name } });

  return nameInput;
}

function submitCreateRoute(): void {
  fireEvent.click(screen.getByRole("button", { name: "Create route" }));
}

describe("route add dialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps the dialog and the entered values when the save fails", async () => {
    const onSubmit = vi
      .fn<(input: CreateRouteInput) => Promise<boolean>>()
      .mockResolvedValue(false);
    renderDialog(onSubmit);

    const nameInput = await openAndFillForm("Primary route");
    submitCreateRoute();

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0]?.[0].name).toBe("Primary route");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(nameInput.value).toBe("Primary route");
  });

  it("closes the dialog and resets the form after a successful save", async () => {
    const onSubmit = vi.fn<(input: CreateRouteInput) => Promise<boolean>>().mockResolvedValue(true);
    renderDialog(onSubmit);

    await openAndFillForm("Primary route");
    submitCreateRoute();

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
