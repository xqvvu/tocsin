// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { EventTitleCell } from "#/features/events/ui/event-title-cell";
import { AppIntlProvider } from "#/i18n/provider";

describe("event title cell", () => {
  afterEach(() => {
    cleanup();
  });

  it("marks a parser-rejected payload in the event list", () => {
    render(
      <AppIntlProvider locale="zh-Hans">
        <EventTitleCell
          title="Provider parser rejected webhook payload"
          fingerprint="parse_failed:src-1:abc"
          severity="unknown"
          parseFailed
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("解析失败")).toBeTruthy();
  });

  it("leaves a successfully parsed event unmarked", () => {
    render(
      <AppIntlProvider locale="zh-Hans">
        <EventTitleCell
          title="CPU high"
          fingerprint="cpu:api"
          severity="critical"
          parseFailed={false}
        />
      </AppIntlProvider>,
    );

    expect(screen.queryByText("解析失败")).toBeNull();
  });
});
