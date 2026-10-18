// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { DeliveryAttempt } from "@tocsin/core";

import { DeliveryAttemptsTable } from "#/features/deliveries/ui/delivery-attempts-table";
import { AppIntlProvider } from "#/i18n/provider";

vi.mock("#/features/operations/ui/operation-timestamp", () => ({
  OperationTimestamp: ({ value }: { value: string }) => <span>{value}</span>,
}));

// The dialog renders JSON with the shiki-backed block; the test only needs the
// exact text to prove the full body made it through.
vi.mock("#/components/ai-elements/code-block", () => ({
  CodeBlock: ({ code }: { code: string }) => <pre>{code}</pre>,
}));

describe("delivery attempts table", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows per-attempt send time and leaves a running attempt without one", () => {
    renderTable([
      attemptFixture({
        attemptNumber: 1,
        startedAt: "2026-10-12T10:00:05.000Z",
        finishedAt: "2026-10-12T10:00:10.000Z",
      }),
      attemptFixture({
        attemptNumber: 2,
        state: "running",
        startedAt: "2026-10-12T10:00:30.000Z",
        finishedAt: null,
        responseStatus: null,
      }),
    ]);

    expect(screen.getByText("Duration")).toBeTruthy();
    expect(screen.getByText("5.0s")).toBeTruthy();
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("opens the full response body that the table cell truncates", async () => {
    const longMessage = "upstream rejected the payload ".repeat(20);
    const body = JSON.stringify({ code: 400, message: longMessage });

    renderTable([attemptFixture({ state: "failed", responseStatus: 400, responseBody: body })]);

    // The cell keeps one truncated line; the dialog is the only place the full
    // body is readable.
    expect(screen.queryByText(longMessage)).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "View the error and response for attempt #1" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain('"message"');
    expect(dialog.textContent).toContain(longMessage);
  });

  it("shows the full error and explains a missing response body", async () => {
    const error = "connect ETIMEDOUT 10.0.0.5:443";

    renderTable([attemptFixture({ state: "failed", error, responseBody: null })]);

    fireEvent.click(
      screen.getByRole("button", { name: "View the error and response for attempt #1" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain(error);
    expect(dialog.textContent).toContain("No response body recorded for this attempt");
  });

  it("explains an empty attempt list instead of rendering a blank table", () => {
    renderTable([]);

    expect(screen.getByText("No attempts recorded")).toBeTruthy();
  });
});

function renderTable(attempts: DeliveryAttempt[]): void {
  render(
    <AppIntlProvider locale="en-US">
      <DeliveryAttemptsTable attempts={attempts} />
    </AppIntlProvider>,
  );
}

function attemptFixture(overrides: Partial<DeliveryAttempt> = {}): DeliveryAttempt {
  return {
    id: "attempt-1",
    deliveryId: "delivery-1",
    attemptNumber: 1,
    state: "succeeded",
    responseStatus: 200,
    responseBody: null,
    error: null,
    startedAt: "2026-10-12T10:00:05.000Z",
    finishedAt: "2026-10-12T10:00:08.000Z",
    ...overrides,
  };
}
