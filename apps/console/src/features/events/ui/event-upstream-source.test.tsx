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

  it("links Grafana dashboard, panel, and silence pages", () => {
    renderSource("zh-Hans", {
      provider: "grafana",
      externalURL: "https://grafana.example.test/",
      dashboardURL: "https://grafana.example.test/d/checkout-latency",
      panelURL: "https://grafana.example.test/d/checkout-latency?viewPanel=2",
      silenceURL: "https://grafana.example.test/alerting/silence/new?alertmanager=grafana",
    });

    const dashboardLink = screen.getByRole("link", { name: /仪表盘/ });
    expect(dashboardLink.getAttribute("href")).toBe(
      "https://grafana.example.test/d/checkout-latency",
    );
    expect(dashboardLink.getAttribute("target")).toBe("_blank");
    expect(dashboardLink.getAttribute("rel")).toBe("noopener noreferrer");

    expect(screen.getByRole("link", { name: /面板/ }).getAttribute("href")).toBe(
      "https://grafana.example.test/d/checkout-latency?viewPanel=2",
    );
    expect(screen.getByRole("link", { name: /上游静默页/ }).getAttribute("href")).toBe(
      "https://grafana.example.test/alerting/silence/new?alertmanager=grafana",
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
