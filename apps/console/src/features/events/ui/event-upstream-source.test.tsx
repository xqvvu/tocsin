// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { JsonObject } from "@tocsin/core";

import { EventUpstreamSource } from "#/features/events/ui/event-upstream-source";
import { AppIntlProvider } from "#/i18n/provider";

describe("event upstream source", () => {
  afterEach(() => {
    cleanup();
  });

  it("links back to the upstream alert in a new tab without leaking the opener", () => {
    renderSource("zh-Hans", {
      provider: "alertmanager",
      externalURL: "https://alertmanager.example.test/",
      generatorURL: "https://prometheus.example.test/graph?g0.expr=up",
    });

    const alertLink = screen.getByRole("link", { name: /上游告警页/ });
    expect(alertLink.getAttribute("href")).toBe("https://alertmanager.example.test/");
    expect(alertLink.getAttribute("target")).toBe("_blank");
    expect(alertLink.getAttribute("rel")).toBe("noopener noreferrer");
    expect(alertLink.textContent).toContain("alertmanager.example.test");

    const generatorLink = screen.getByRole("link", { name: /规则来源/ });
    expect(generatorLink.getAttribute("href")).toBe(
      "https://prometheus.example.test/graph?g0.expr=up",
    );
  });

  it("renders the intake metadata with product labels", () => {
    renderSource("zh-Hans", {
      provider: "alertmanager",
      alertCount: 2,
      receiver: "oncall",
      groupKey: '{}:{alertname="DiskFull"}',
    });

    expect(screen.getByText("接入类型")).toBeTruthy();
    expect(screen.getByText("alertmanager")).toBeTruthy();
    expect(screen.getByText("告警条数")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("接收器")).toBeTruthy();
    expect(screen.getByText("oncall")).toBeTruthy();
    expect(screen.getByText("分组键")).toBeTruthy();
  });

  it("falls back to the raw provider key for unknown fields", () => {
    renderSource("en-US", { provider: "fastgpt", probeStatus: "green" });

    expect(screen.getByText("Provider")).toBeTruthy();
    expect(screen.getByText("probeStatus")).toBeTruthy();
    expect(screen.getByText("green")).toBeTruthy();
  });

  it("renders nothing when there is no upstream metadata", () => {
    const { container } = renderSource("en-US", {});

    expect(container.textContent).toBe("");
  });
});

function renderSource(locale: "zh-Hans" | "en-US", providerMetadata: JsonObject) {
  return render(
    <AppIntlProvider locale={locale}>
      <EventUpstreamSource providerMetadata={providerMetadata} />
    </AppIntlProvider>,
  );
}
