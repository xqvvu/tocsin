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
  delivery: { paused: false, pausedAt: null },
  renders: [
    {
      destinationId: "destination-1",
      destinationName: "Ops webhook",
      enabled: true,
      ok: true,
      renderedPayload: '{"text":"Checkout unavailable"}',
      errorMessage: null,
      verdict: "deliver",
      suppression: null,
    },
  ],
};

const silencedResult: SourceRehearsalResult = {
  ...result,
  delivery: { paused: true, pausedAt: "2026-10-28T11:00:00.000Z" },
  renders: [
    {
      ...result.renders[0]!,
      verdict: "suppressed",
      suppression: {
        id: "suppression-1",
        name: "Checkout maintenance",
        kind: "maintenance_window",
        reason: "Maintenance window 「Checkout maintenance」 matched severity in [critical]",
        checks: [
          {
            field: "severity",
            matched: true,
            detail: "Expected one of critical, received critical",
            condition: "compare",
            expected: ["critical"],
            actual: "critical",
          },
        ],
      },
    },
  ],
};

const disabledResult: SourceRehearsalResult = {
  ...result,
  renders: [
    {
      ...result.renders[0]!,
      enabled: false,
      verdict: "destination_disabled",
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

  it("shows the JSON example as the payload placeholder", () => {
    renderDialog(async () => result);
    openDialog();

    // The example is literal JSON. Interpolating it as an ICU message throws on
    // every render and falls back to the bare key, so the operator sees
    // "sources.rehearsal.payloadPlaceholder" instead of a usable example.
    expect(screen.getByLabelText("Webhook body").getAttribute("placeholder")).toBe(
      '{"title":"Checkout unavailable","labels":{"service":"checkout"}}',
    );
  });

  it("caps the dialog height and keeps a single scrolling region", () => {
    renderDialog(async () => result);
    openDialog();

    const content = document.querySelector('[data-slot="dialog-content"]');
    // Without a viewport cap a long payload pushes the footer (run/cancel) out
    // of a fixed, body-locked dialog, leaving no way to reach it.
    expect(content?.className).toContain("max-h-[calc(100dvh-2rem)]");
    expect(content?.querySelectorAll(".overflow-y-auto").length).toBe(1);
    expect(screen.getByLabelText("Webhook body").className).toContain("max-h-48");
  });

  it("announces the rehearsal outcome through a live region", async () => {
    const onRehearse = vi.fn<() => Promise<SourceRehearsalResult>>(async () => result);
    renderDialog(onRehearse);
    openDialog();

    // The region exists before the run. Creating it together with its content
    // lets a screen reader treat the insertion as a new region and stay silent.
    const status = screen.getByRole("status");

    expect(status.textContent).toBe("");

    fireEvent.change(screen.getByLabelText("Webhook body"), {
      target: { value: '{"title":"Checkout unavailable"}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run rehearsal" }));

    expect(await screen.findByText("Checkout unavailable")).toBeTruthy();
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.contains(screen.getByText("Route evaluation (1/1 matched)"))).toBe(true);
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

  it("discloses the real delivery verdict next to the render", async () => {
    const onRehearse = vi.fn(async () => silencedResult);
    renderDialog(onRehearse);
    openDialog();

    fireEvent.change(screen.getByLabelText("Webhook body"), {
      target: { value: '{"title":"Checkout unavailable"}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run rehearsal" }));

    // A target can render perfectly and still never be sent; the verdict badge
    // and the silence rule are what stop the operator reading "preview" as
    // "delivered".
    expect(await screen.findByText("Would be silenced")).toBeTruthy();
    expect(screen.getByText("Silence rule")).toBeTruthy();
    expect(screen.getAllByText(/Checkout maintenance/).length).toBeGreaterThan(0);
    expect(screen.getByText("Maintenance window")).toBeTruthy();
    expect(screen.getByText("Delivery is paused globally")).toBeTruthy();
    expect(screen.getByText(/Paused since 2026-10-28T11:00:00.000Z/)).toBeTruthy();
  });

  it("states a disabled target once instead of stacking two badges", async () => {
    const onRehearse = vi.fn(async () => disabledResult);
    renderDialog(onRehearse);
    openDialog();

    fireEvent.change(screen.getByLabelText("Webhook body"), {
      target: { value: '{"title":"Checkout unavailable"}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run rehearsal" }));

    // "Target disabled" and "Disabled" side by side read as two different
    // facts. The verdict already carries the state for this verdict only.
    expect(await screen.findByText("Target disabled")).toBeTruthy();
    expect(screen.queryByText("Disabled")).toBeNull();
  });

  it("still shows the target state when another verdict decides the outcome", async () => {
    const onRehearse = vi.fn(async () => ({
      ...silencedResult,
      renders: [
        {
          ...silencedResult.renders[0]!,
          enabled: false,
        },
      ],
    }));
    renderDialog(onRehearse);
    openDialog();

    fireEvent.change(screen.getByLabelText("Webhook body"), {
      target: { value: '{"title":"Checkout unavailable"}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run rehearsal" }));

    // Silence wins the verdict, so the target's own state is still useful and
    // must not be hidden along with the duplicate.
    expect(await screen.findByText("Would be silenced")).toBeTruthy();
    expect(screen.getByText("Disabled")).toBeTruthy();
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
