// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { EventDetailData } from "#/features/events/ui/event-detail-types";
import { EventEvidenceDownload } from "#/features/events/ui/event-evidence-download";

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

describe("event evidence download", () => {
  beforeEach(() => {
    testState.downloadTextFile.mockReset();
    testState.toastSuccess.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("downloads the event detail as a redacted JSON bundle", () => {
    render(<EventEvidenceDownload detail={detailFixture()} />);

    fireEvent.click(screen.getByRole("button", { name: "events.detail.evidence.action" }));

    expect(testState.downloadTextFile).toHaveBeenCalledTimes(1);
    const call = testState.downloadTextFile.mock.calls[0]?.[0];

    expect(call?.filename).toMatch(/^tocsin-event-evt_1-\d{8}T\d{6}Z\.json$/);
    expect(call?.type).toBe("application/json;charset=utf-8");

    const bundle = JSON.parse(call?.text ?? "{}");
    expect(bundle.kind).toBe("event");
    expect(bundle.subjectId).toBe("evt_1");
    expect(bundle.event.event.normalized.title).toBe("Disk usage");
    // The export runs the same redaction pass as the page.
    expect(call?.text).not.toContain("sk-live-123");
    expect(testState.toastSuccess).toHaveBeenCalledWith("events.detail.evidence.toast.success");
  });
});

function detailFixture(): EventDetailData {
  return {
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
      rawPayload: { apiKey: "sk-live-123" },
      rawHeaders: {},
      routeMatches: null,
      receivedAt: "2026-10-21T01:30:01.000Z",
    },
    rawPayloadPruned: false,
    source: { id: "src_1", name: "Grafana", provider: "grafana", enabled: true },
    routeMatches: [],
    routeMatchesProvenance: "snapshot",
    routeMatchGaps: [],
    deliveries: [],
  } as unknown as EventDetailData;
}
