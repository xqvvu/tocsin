// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { DeliveryAttempt } from "@tocsin/core";

import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";
import { DeliverySummaryTab } from "#/features/deliveries/ui/delivery-summary-tab";
import { AppIntlProvider } from "#/i18n/provider";

vi.mock("#/features/operations/ui/operation-timestamp", () => ({
  OperationTimestamp: ({ value }: { value: string }) => <span>{value}</span>,
}));

// The summary mounts the suppression outlook; an empty rule list keeps these
// field-level assertions focused on the delivery facts.
vi.mock("#/features/suppressions/api/suppression.queries", () => ({
  suppressionsQueryOptions: () => ({
    queryKey: ["test", "suppressions"],
    queryFn: async () => [],
    staleTime: Infinity,
  }),
}));

// The summary only needs Link's destination; rendering a plain anchor keeps this
// unit test free of a router.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    ...rest
  }: {
    children: ReactNode;
    to: string;
    params?: Record<string, string>;
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to.replace(/\$(\w+)/g, (_, key: string) => params?.[key] ?? "")} {...rest}>
      {children}
    </a>
  ),
}));

describe("delivery summary tab", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows queue, send, and end-to-end time next to the raw timestamps", () => {
    renderSummary(
      detailFixture({
        createdAt: "2026-10-12T10:00:00.000Z",
        finishedAt: "2026-10-12T10:00:20.000Z",
      }),
      [
        attemptFixture({
          startedAt: "2026-10-12T10:00:05.000Z",
          finishedAt: "2026-10-12T10:00:08.000Z",
        }),
      ],
    );

    expect(screen.getByText("Created")).toBeTruthy();
    expect(screen.getByText("Finished")).toBeTruthy();
    expect(screen.getByText("Queue wait")).toBeTruthy();
    expect(screen.getByText("Send time")).toBeTruthy();
    expect(screen.getByText("End-to-end")).toBeTruthy();
    expect(screen.getByText("5.0s")).toBeTruthy();
    expect(screen.getByText("3.0s")).toBeTruthy();
    expect(screen.getByText("20.0s")).toBeTruthy();
  });

  it("falls back to a dash while the delivery has no finished attempt", () => {
    renderSummary(detailFixture({ createdAt: "2026-10-12T10:00:00.000Z", finishedAt: null }), []);

    expect(screen.queryByText("Send time")).toBeTruthy();
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(3);
  });

  it("shows the target-system message reference with its type and a copy action", () => {
    renderSummary(
      detailFixture({
        createdAt: "2026-10-12T10:00:00.000Z",
        finishedAt: "2026-10-12T10:00:20.000Z",
        providerReference: { type: "feishu_message_id", value: "om_abc123" },
      }),
      [],
    );

    expect(screen.getByText("External reference")).toBeTruthy();
    expect(screen.getByText("om_abc123")).toBeTruthy();
    // Machine-readable type stays untranslated so it matches adapter output.
    expect(screen.getByText("feishu_message_id")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy external reference" })).toBeTruthy();
  });

  it("links the event id back to the alert it was rendered from", () => {
    renderSummary(
      detailFixture({
        createdAt: "2026-10-12T10:00:00.000Z",
        finishedAt: "2026-10-12T10:00:20.000Z",
      }),
      [],
    );

    // "Why was this sent?" is answered on the event page; the raw id is the
    // only handle the delivery detail shows.
    expect(screen.getByRole("link", { name: "event-1" }).getAttribute("href")).toBe(
      "/events/event-1",
    );
  });

  it("asks the suppression outlook only when the delivery was not suppressed", async () => {
    renderSummary(
      detailFixture({
        createdAt: "2026-10-12T10:00:00.000Z",
        finishedAt: "2026-10-12T10:00:20.000Z",
      }),
      [],
    );

    expect(await screen.findByText("Not suppressed")).toBeTruthy();
    expect(screen.getByText("Suppression decision outlook")).toBeTruthy();
  });

  it("replaces the outlook with the suppression notice on a suppressed delivery", () => {
    renderSummary(
      detailFixture({
        createdAt: "2026-10-12T10:00:00.000Z",
        finishedAt: null,
        state: "suppressed",
      }),
      [],
    );

    // The delivery-level notice above the tabs already answers "why was it not sent".
    expect(screen.queryByText("Suppression decision outlook")).toBeNull();
    expect(screen.queryByText("Not suppressed")).toBeNull();
  });

  it("does not offer a copy action when the delivery has no message reference", () => {
    renderSummary(
      detailFixture({
        createdAt: "2026-10-12T10:00:00.000Z",
        finishedAt: "2026-10-12T10:00:20.000Z",
      }),
      [],
    );

    // A copy button that copies the literal "-" placeholder is worse than none.
    expect(screen.queryByRole("button", { name: "Copy external reference" })).toBeNull();
  });
});

function renderSummary(detail: DeliveryDetailData, attempts: DeliveryAttempt[]): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <AppIntlProvider locale="en-US">
        <DeliverySummaryTab detail={{ ...detail, attempts }} />
      </AppIntlProvider>
    </QueryClientProvider>,
  );
}

function detailFixture(overrides: {
  createdAt: string;
  finishedAt: string | null;
  state?: DeliveryDetailData["job"]["state"];
  providerReference?: DeliveryDetailData["providerReference"];
}): DeliveryDetailData {
  return {
    job: {
      id: "delivery-1",
      eventId: "event-1",
      destinationId: "destination-1",
      routeId: null,
      state: overrides.state ?? (overrides.finishedAt ? "succeeded" : "pending"),
      attemptCount: 1,
      maxAttempts: 5,
      nextAttemptAt: null,
      lastError: null,
      suppressionId: null,
      suppressedAt: null,
      suppressReason: null,
      createdAt: overrides.createdAt,
      updatedAt: overrides.createdAt,
      finishedAt: overrides.finishedAt,
    },
    event: {
      id: "event-1",
      sourceId: "source-1",
      normalized: {
        title: "Disk almost full",
        message: "disk usage 92%",
        severity: "warning",
        status: "firing",
        fingerprint: "disk-full",
        labels: {},
        fields: {},
        links: [],
      },
      rawPayload: {},
      rawHeaders: {},
      receivedAt: overrides.createdAt,
      providerMetadata: {},
    },
    source: { id: "source-1", name: "Prometheus", provider: "prometheus", enabled: true },
    destination: { id: "destination-1", name: "Ops group", kind: "feishu", enabled: true },
    destinationMetadata: {},
    route: null,
    renderedPayload: null,
    providerReference: overrides.providerReference ?? null,
    attempts: [],
    pings: [],
  } as unknown as DeliveryDetailData;
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
