// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { EventDetailData } from "#/features/events/ui/event-detail-types";
import { EventNormalizedTab } from "#/features/events/ui/event-normalized-tab";
import { AppIntlProvider } from "#/i18n/provider";

/**
 * A realistic punctuated identifier — the shape that exposed the bug.
 * `:` and `-` are break opportunities, so `overflow-wrap: break-word` used
 * them and left the leading run wider than its column.
 */
const LONG_IDEMPOTENCY_KEY = "fastgpt:6a995e651461dc586c6cdced:green:2026-09-25T07:30:07.659Z";
const LONG_FINGERPRINT = "fastgpt:6a995e651461dc586c6cdced";

function detail(overrides: Partial<EventDetailData["event"]> = {}): EventDetailData {
  return {
    event: {
      id: "b2a515b9-fff3-40e5-a969-2e58781f5b3a",
      sourceId: "source-1",
      receivedAt: "2026-09-27T00:54:11.000Z",
      idempotencyKey: LONG_IDEMPOTENCY_KEY,
      providerMetadata: {},
      rawPayload: {},
      normalized: {
        title: "speech-01-turbo model probe recovered",
        message: "MiniMax tts model probe recovered after 1 attempt in 295 ms",
        severity: "info",
        status: "resolved",
        fingerprint: LONG_FINGERPRINT,
        labels: { provider: "fastgpt" },
        occurredAt: "2026-09-25T15:30:07.000Z",
      },
      ...overrides,
    },
    rawPayloadPruned: false,
    source: { id: "source-1", name: "FastGPT 模型探测", provider: "fastgpt", enabled: true },
    routeMatches: [],
    routeMatchesProvenance: "intake_snapshot",
    routeMatchGaps: [],
    deliveries: [],
  } as unknown as EventDetailData;
}

function renderTab(data: EventDetailData = detail()) {
  return render(
    <AppIntlProvider locale="zh-Hans">
      <EventNormalizedTab detail={data} />
    </AppIntlProvider>,
  );
}

describe("event normalized tab", () => {
  afterEach(() => {
    cleanup();
  });

  it("wraps long identifiers anywhere rather than only at punctuation", () => {
    renderTab();

    // The value must be present as one intact string — a value broken into
    // fragments by wrapping is still one text node, but a TRUNCATED one is not.
    // Both the idempotency key and the fingerprint must survive intact.
    expect(screen.getByText(LONG_IDEMPOTENCY_KEY)).toBeTruthy();
    expect(screen.getByText(LONG_FINGERPRINT)).toBeTruthy();
  });

  it("styles the identifier's line with break-all, not overflow-wrap", () => {
    // jsdom does no layout, so the class is the assertion. `break-all` is what
    // permits a mid-run break; `overflow-wrap: break-word` does not, and that
    // difference is the whole bug.
    const { container } = renderTab();
    const code = container.querySelector("code");

    expect(code).toBeTruthy();
    expect(code?.className).toContain("break-all");
    expect(code?.className).not.toContain("wrap-break-word");
  });

  it("offers a copy action for the identifiers operators grep for", () => {
    renderTab();

    // These three are pasted into log searches, so they must be copyable and
    // not only readable.
    expect(screen.getByRole("button", { name: "复制事件 ID" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "复制指纹" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "复制幂等键" })).toBeTruthy();
  });

  it("omits the copy action when there is no idempotency key", () => {
    // Not every event has one (replay fixtures, parser-failure records), and a
    // copy button that copies the literal "-" placeholder is worse than none.
    renderTab(detail({ idempotencyKey: null }));

    expect(screen.queryByRole("button", { name: "复制幂等键" })).toBeNull();
    // The other two still have real values and keep their actions.
    expect(screen.getByRole("button", { name: "复制指纹" })).toBeTruthy();
  });

  it("lets the field list scroll instead of clipping under the header", () => {
    const { container } = renderTab();
    const list = container.querySelector("dl");

    // The section clips (rounded border), so the list itself has to scroll or
    // a long field set is simply cut off.
    expect(list?.className).toContain("overflow-y-auto");
    expect(list?.className).toContain("min-w-0");
  });
});
