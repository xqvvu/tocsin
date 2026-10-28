// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { SourceRehearsalResult } from "@tocsin/core";

import { SourceRehearsalDialog } from "#/features/sources/ui/source-rehearsal-dialog";
import { AppIntlProvider } from "#/i18n/provider";

// The JSON block owns its own code-block/copy test; here it only has to render.
vi.mock("#/features/events/ui/event-json-block", () => ({
  EventJsonBlock: ({ value }: { value: unknown }) => <pre>{JSON.stringify(value)}</pre>,
}));

const source = {
  id: "source-1",
  name: "Grafana production",
  provider: "grafana" as const,
  enabled: true,
};

const result: SourceRehearsalResult = {
  source,
  receivedAt: "2026-10-28T12:00:00.000Z",
  parse: {
    ok: true,
    normalizedEvent: {
      title: "Checkout unavailable",
      message: "checkout returned 503",
      severity: "critical",
      status: "firing",
      fingerprint: "grafana:abc",
      labels: { service: "checkout" },
      occurredAt: "2026-10-28T11:59:00.000Z",
    },
    providerMetadata: {},
  },
  routes: [
    {
      routeId: "route-1",
      routeName: "Critical checkout",
      matched: true,
      destinationIds: ["destination-1"],
      checks: [
        { field: "enabled", matched: true, detail: "Route is enabled", condition: "none" },
        { field: "severity", matched: true, detail: "Severity is critical", condition: "compare" },
      ],
    },
  ],
  renders: [
    {
      destinationId: "destination-1",
      destinationName: "Ops webhook",
      enabled: true,
      ok: true,
      renderedPayload: '{"text":"Checkout unavailable"}',
      errorMessage: null,
    },
  ],
};

function renderDialog(onRehearse: () => Promise<SourceRehearsalResult>) {
  render(
    <AppIntlProvider locale="en-US">
      <SourceRehearsalDialog sources={[source]} onRehearse={onRehearse} />
    </AppIntlProvider>,
  );
}

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: /rehearse intake/i }));
}

describe("source rehearsal dialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("rejects malformed JSON before calling the server", () => {
    const onRehearse = vi.fn(async () => result);
    renderDialog(onRehearse);
    openDialog();

    fireEvent.change(screen.getByLabelText("Webhook body"), {
      target: { value: "{oops" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run rehearsal" }));

    expect(screen.getByText("Enter a valid JSON webhook body")).toBeTruthy();
    expect(onRehearse).not.toHaveBeenCalled();
  });

  it("shows the parse result, route evidence, and rendered target", async () => {
    const onRehearse = vi.fn(async () => result);
    renderDialog(onRehearse);
    openDialog();

    fireEvent.change(screen.getByLabelText("Webhook body"), {
      target: { value: '{"title":"Checkout unavailable"}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run rehearsal" }));

    expect(await screen.findByText("Checkout unavailable")).toBeTruthy();
    expect(onRehearse).toHaveBeenCalledWith({
      sourceId: "source-1",
      payload: { title: "Checkout unavailable" },
    });
    expect(screen.getByText("Critical checkout")).toBeTruthy();
    expect(screen.getByText("Route evaluation (1/1 matched)")).toBeTruthy();
    expect(screen.getByText("Ops webhook")).toBeTruthy();
    expect(screen.getByText('{"text":"Checkout unavailable"}')).toBeTruthy();
  });

  it("surfaces a request failure without dropping the dialog", async () => {
    const onRehearse = vi.fn(async () => {
      throw new Error("Source not found: source-1");
    });
    renderDialog(onRehearse);
    openDialog();

    fireEvent.change(screen.getByLabelText("Webhook body"), {
      target: { value: '{"title":"Checkout unavailable"}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run rehearsal" }));

    expect(await screen.findByText("Rehearsal failed")).toBeTruthy();
    expect(screen.getByText("Source not found: source-1")).toBeTruthy();
  });
});
