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
          alertCount={null}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("解析失败")).toBeTruthy();
  });

  it("replaces intake's English fallback title with localized copy", () => {
    render(
      <AppIntlProvider locale="zh-Hans">
        <EventTitleCell
          title="Provider parser rejected webhook payload"
          fingerprint="parse_failed:src-1:abc"
          severity="unknown"
          parseFailed
          alertCount={null}
        />
      </AppIntlProvider>,
    );

    // Intake stores a fixed English title before any viewer locale is known;
    // rendering it as-is put English text beside the zh-Hans badge.
    expect(screen.getByText("未能解析的上游载荷")).toBeTruthy();
    expect(screen.queryByText("Provider parser rejected webhook payload")).toBeNull();
  });

  it("keeps the stored title for events the parser accepted", () => {
    render(
      <AppIntlProvider locale="zh-Hans">
        <EventTitleCell
          title="磁盘将满"
          fingerprint="disk-full"
          severity="critical"
          parseFailed={false}
          alertCount={null}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("磁盘将满")).toBeTruthy();
    expect(screen.queryByText("未能解析的上游载荷")).toBeNull();
  });

  it("leaves a successfully parsed event unmarked", () => {
    render(
      <AppIntlProvider locale="zh-Hans">
        <EventTitleCell
          title="CPU high"
          fingerprint="cpu:api"
          severity="critical"
          parseFailed={false}
          alertCount={null}
        />
      </AppIntlProvider>,
    );

    expect(screen.queryByText("解析失败")).toBeNull();
  });

  it("shows the upstream alert-group size for a multi-alert notification group", () => {
    render(
      <AppIntlProvider locale="zh-Hans">
        <EventTitleCell
          title="磁盘将满"
          fingerprint="disk-full"
          severity="critical"
          parseFailed={false}
          alertCount={20}
        />
      </AppIntlProvider>,
    );

    // Tocsin normalizes only the group's first alert, so without the badge a
    // twenty-alert outage reads like a single ordinary event.
    expect(screen.getByText("20 条告警")).toBeTruthy();
  });

  it("hides the group badge for a single-alert group", () => {
    render(
      <AppIntlProvider locale="zh-Hans">
        <EventTitleCell
          title="磁盘将满"
          fingerprint="disk-full"
          severity="critical"
          parseFailed={false}
          alertCount={1}
        />
      </AppIntlProvider>,
    );

    expect(screen.queryByText("1 条告警")).toBeNull();
  });

  it("hides the group badge when the provider reported no count", () => {
    render(
      <AppIntlProvider locale="zh-Hans">
        <EventTitleCell
          title="CPU high"
          fingerprint="cpu:api"
          severity="critical"
          parseFailed={false}
          alertCount={null}
        />
      </AppIntlProvider>,
    );

    expect(screen.queryByText(/条告警/)).toBeNull();
  });
});
