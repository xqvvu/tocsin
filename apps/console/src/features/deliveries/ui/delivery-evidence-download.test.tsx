// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";
import { DeliveryEvidenceDownload } from "#/features/deliveries/ui/delivery-evidence-download";

const testState = vi.hoisted(() => ({
  downloadTextFile: vi.fn<(input: { filename: string; text: string; type: string }) => void>(),
  toastSuccess: vi.fn<(message: string) => void>(),
}));

vi.mock("#/lib/browser", () => ({
  downloadTextFile: testState.downloadTextFile,
}));

vi.mock("#/i18n/use-i18n", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { success: testState.toastSuccess },
}));

describe("delivery evidence download", () => {
  beforeEach(() => {
    testState.downloadTextFile.mockReset();
    testState.toastSuccess.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("downloads attempts and the rendered payload in one redacted bundle", () => {
    render(<DeliveryEvidenceDownload detail={detailFixture()} />);

    fireEvent.click(screen.getByRole("button", { name: "deliveries.detail.evidence.action" }));

    expect(testState.downloadTextFile).toHaveBeenCalledTimes(1);
    const call = testState.downloadTextFile.mock.calls[0]?.[0];

    expect(call?.filename).toMatch(/^tocsin-delivery-dlv_1-\d{8}T\d{6}Z\.json$/);

    const bundle = JSON.parse(call?.text ?? "{}");
    expect(bundle.kind).toBe("delivery");
    expect(bundle.subjectId).toBe("dlv_1");
    expect(bundle.delivery.attempts).toHaveLength(1);
    expect(bundle.delivery.renderedPayload).toMatchObject({ text: "Disk usage" });
    expect(call?.text).not.toContain("sign-me");
    expect(testState.toastSuccess).toHaveBeenCalledWith("deliveries.detail.evidence.toast.success");
  });
});

function detailFixture(): DeliveryDetailData {
  return {
    job: {
      id: "dlv_1",
      eventId: "evt_1",
      destinationId: "dst_1",
      routeId: "rt_1",
      state: "succeeded",
      attemptCount: 1,
      maxAttempts: 3,
      nextAttemptAt: null,
      lastError: null,
      createdAt: "2026-10-21T01:30:02.000Z",
      updatedAt: "2026-10-21T01:30:03.000Z",
    },
    event: {
      id: "evt_1",
      sourceId: "src_1",
      idempotencyKey: null,
      normalized: {
        title: "Disk usage",
        message: "Disk is almost full",
        severity: "warning",
        status: "firing",
        fingerprint: "disk-usage",
        occurredAt: "2026-10-21T01:30:00.000Z",
        labels: {},
      },
      providerMetadata: {},
      rawPayload: {},
      rawHeaders: {},
      routeMatches: null,
      receivedAt: "2026-10-21T01:30:01.000Z",
    },
    rawPayloadPruned: false,
    source: { id: "src_1", name: "Grafana", provider: "grafana", enabled: true },
    destination: { id: "dst_1", name: "On-call chat", kind: "feishu", enabled: true },
    destinationMetadata: {},
    route: null,
    renderedPayload: { text: "Disk usage", signingSecret: "sign-me" },
    providerReference: null,
    attempts: [
      {
        id: "att_1",
        deliveryId: "dlv_1",
        attemptNumber: 1,
        state: "succeeded",
        responseStatus: 200,
        responseBody: '{"ok":true}',
        error: null,
        startedAt: "2026-10-21T01:30:02.000Z",
        finishedAt: "2026-10-21T01:30:03.000Z",
      },
    ],
    pings: [],
  } as unknown as DeliveryDetailData;
}
