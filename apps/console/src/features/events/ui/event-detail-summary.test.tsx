// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { REDACTED_VALUE, type DeliveryState, type JsonObject } from "@tocsin/core";

import { getEventDeliveryStats } from "#/features/events/ui/event-detail-stats";
import { EventDetailSummary } from "#/features/events/ui/event-detail-summary";
import type { EventDetailData } from "#/features/events/ui/event-detail-types";
import { AppIntlProvider } from "#/i18n/provider";

describe("event detail summary delivery health", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows every state that has deliveries instead of a zero success/failure pair", () => {
    renderSummary("zh-Hans", ["pending", "running", "succeeded", "suppressed"]);

    expect(screen.getByText("待处理 1")).toBeTruthy();
    expect(screen.getByText("运行中 1")).toBeTruthy();
    expect(screen.getByText("成功 1")).toBeTruthy();
    expect(screen.getByText("已抑制 1")).toBeTruthy();
    expect(screen.queryByText(/失败 0/)).toBeNull();
    expect(screen.getByText("通知投递 4 条")).toBeTruthy();
  });

  it("uses the destructive badge for failed deliveries", () => {
    renderSummary("zh-Hans", ["failed", "failed", "succeeded"]);

    const failed = screen.getByText("失败 2");
    expect(failed.className).toContain("text-destructive");
    expect(screen.getByText("通知投递 3 条")).toBeTruthy();
  });

  it("shows 无投递 when the event produced no deliveries", () => {
    renderSummary("zh-Hans", []);

    expect(screen.getByText("无投递")).toBeTruthy();
    expect(screen.getByText("通知投递 0 条")).toBeTruthy();
  });

  it("localizes the health badges in English", () => {
    renderSummary("en-US", ["pending", "suppressed"]);

    expect(screen.getByText("1 pending")).toBeTruthy();
    expect(screen.getByText("1 suppressed")).toBeTruthy();
    expect(screen.queryByText(/succeeded/)).toBeNull();
  });

  it("offers one-click silence for the event title and message", () => {
    renderSummary("zh-Hans", []);

    expect(screen.getByRole("button", { name: "按标题静默相似告警" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "按消息静默相似告警" })).toBeTruthy();
  });

  it("localizes the fallback headline of a parser-rejected event", () => {
    renderSummary("zh-Hans", [], {
      title: "Provider parser rejected webhook payload",
      message: "Webhook payload was stored for inspection but could not be normalized",
      providerMetadata: { parseFailed: true, reason: "invalid_payload" },
    });

    // Intake writes this audit row's headline before any viewer locale exists;
    // the summary is a presentation slot, so it must not surface raw English.
    expect(screen.getByText("未能解析的上游载荷")).toBeTruthy();
    expect(screen.getByText("原始载荷已保留，可在「原始调试」中核对")).toBeTruthy();
    expect(screen.queryByText("Provider parser rejected webhook payload")).toBeNull();
  });

  it("localizes the fallback headline of a parser-rejected event in English", () => {
    renderSummary("en-US", [], {
      title: "Provider parser rejected webhook payload",
      message: "Webhook payload was stored for inspection but could not be normalized",
      providerMetadata: { parseFailed: true },
    });

    expect(screen.getByText("Upstream payload could not be parsed")).toBeTruthy();
  });

  it("keeps the stored headline for events the parser accepted", () => {
    renderSummary("zh-Hans", [], { providerMetadata: { parseFailed: false } });

    expect(screen.getByText("磁盘将满")).toBeTruthy();
    expect(screen.queryByText("未能解析的上游载荷")).toBeNull();
  });

  it("disables text silence when the displayed text cannot match", () => {
    renderSummary("zh-Hans", [], {
      title: `磁盘 ${REDACTED_VALUE}`,
      message: "   ",
    });

    // Redacted text differs from the stored value, and an empty fragment would
    // be dropped into a silence-everything rule; both entries must stay closed.
    const titleButton = screen.getByRole("button", { name: /标题包含已脱敏内容/ });
    const messageButton = screen.getByRole("button", { name: /当前消息为空/ });

    expect((titleButton as HTMLButtonElement).disabled).toBe(true);
    expect((messageButton as HTMLButtonElement).disabled).toBe(true);
  });
});

function renderSummary(
  locale: "zh-Hans" | "en-US",
  states: DeliveryState[],
  overrides: { title?: string; message?: string; providerMetadata?: JsonObject } = {},
) {
  const deliveries = states.map((state, index): EventDetailData["deliveries"][number] => ({
    id: `dlv_${index}`,
    eventId: "evt_1",
    destinationId: `dst_${index}`,
    routeId: "rt_1",
    state,
    attemptCount: 0,
    maxAttempts: 3,
    nextAttemptAt: null,
    lastError: null,
    suppressionId: null,
    suppressedAt: null,
    suppressReason: null,
    createdAt: "2026-10-20T12:00:02.000Z",
    updatedAt: "2026-10-20T12:00:02.000Z",
    finishedAt: null,
    destinationName: `目标 ${index + 1}`,
    routeName: "夜班",
    providerReference: null,
    lastResponseStatus: null,
    lastResponseAt: null,
  }));

  const detail: EventDetailData = {
    event: {
      id: "evt_1",
      sourceId: "src_1",
      idempotencyKey: null,
      normalized: {
        title: overrides.title ?? "磁盘将满",
        message: overrides.message ?? "磁盘使用率超过 95%",
        severity: "critical",
        status: "firing",
        fingerprint: "disk-full",
        labels: {},
        occurredAt: "2026-10-20T12:00:00.000Z",
      },
      providerMetadata: overrides.providerMetadata ?? {},
      rawPayload: {},
      rawHeaders: {},
      routeMatches: null,
      receivedAt: "2026-10-20T12:00:01.000Z",
    },
    rawPayloadPruned: false,
    source: {
      id: "src_1",
      name: "Prometheus",
      provider: "alertmanager",
      enabled: true,
    },
    routeMatches: [],
    routeMatchesProvenance: "intake_snapshot",
    routeMatchGaps: [],
    deliveries,
  };

  // The silence dialogs read query options only when opened, but their hooks
  // still need a client; a fresh one per render keeps cases isolated.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AppIntlProvider locale={locale}>
        <EventDetailSummary
          detail={detail}
          matchedRouteCount={0}
          deliveryStats={getEventDeliveryStats(deliveries)}
        />
      </AppIntlProvider>
    </QueryClientProvider>,
  );
}
