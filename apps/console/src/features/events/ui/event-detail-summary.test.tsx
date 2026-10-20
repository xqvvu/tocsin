// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { DeliveryState } from "@tocsin/core";

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
});

function renderSummary(locale: "zh-Hans" | "en-US", states: DeliveryState[]) {
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
  }));

  const detail: EventDetailData = {
    event: {
      id: "evt_1",
      sourceId: "src_1",
      idempotencyKey: null,
      normalized: {
        title: "磁盘将满",
        message: "磁盘使用率超过 95%",
        severity: "critical",
        status: "firing",
        fingerprint: "disk-full",
        labels: {},
        occurredAt: "2026-10-20T12:00:00.000Z",
      },
      providerMetadata: {},
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

  return render(
    <AppIntlProvider locale={locale}>
      <EventDetailSummary
        detail={detail}
        matchedRouteCount={0}
        deliveryStats={getEventDeliveryStats(deliveries)}
      />
    </AppIntlProvider>,
  );
}
