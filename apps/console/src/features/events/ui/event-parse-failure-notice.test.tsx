// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { EventParseFailureNotice } from "#/features/events/ui/event-parse-failure-notice";
import { AppIntlProvider } from "#/i18n/provider";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#similar">{children}</a>,
}));

describe("event parse failure notice", () => {
  afterEach(() => {
    cleanup();
  });

  it("promotes the stored diagnostics and links to the same failure class", () => {
    render(
      <AppIntlProvider locale="zh-Hans">
        <EventParseFailureNotice
          providerMetadata={{
            provider: "grafana",
            parseFailed: true,
            reason: "invalid_payload",
            errorName: "ProviderParseFailure",
            errorMessage: "alert list is empty",
            payloadHash: "hash-1",
          }}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("告警解析失败")).toBeTruthy();
    expect(screen.getByText("载荷格式无效")).toBeTruthy();
    expect(screen.getByText("ProviderParseFailure")).toBeTruthy();
    expect(screen.getByText("alert list is empty")).toBeTruthy();
    expect(screen.getByText("hash-1")).toBeTruthy();
    expect(screen.getByText("查看同类解析失败")).toBeTruthy();
  });

  it("keeps an unknown reason machine-readable instead of hiding it", () => {
    render(
      <AppIntlProvider locale="en-US">
        <EventParseFailureNotice
          providerMetadata={{ parseFailed: true, reason: "future_reason" }}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("future_reason")).toBeTruthy();
  });

  it("renders nothing for a successfully parsed event", () => {
    const { container } = render(
      <AppIntlProvider locale="en-US">
        <EventParseFailureNotice providerMetadata={{ provider: "grafana" }} />
      </AppIntlProvider>,
    );

    expect(container.innerHTML).toBe("");
  });
});
