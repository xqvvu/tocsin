import { describe, expect, it } from "vite-plus/test";

import { buildEventUpstreamSource } from "#/features/events/model/event-upstream-source";

describe("buildEventUpstreamSource", () => {
  it("turns Alertmanager URLs into links and orders known metadata first", () => {
    const upstream = buildEventUpstreamSource({
      provider: "alertmanager",
      parserVersion: 1,
      payloadHash: "abc123",
      alertCount: 2,
      receiver: "oncall",
      groupKey: '{}:{alertname="DiskFull"}',
      externalURL: "https://alertmanager.example.test/",
      generatorURL: "https://prometheus.example.test/graph?g0.expr=up",
    });

    expect(upstream?.links).toEqual([
      {
        key: "externalURL",
        href: "https://alertmanager.example.test/",
        host: "alertmanager.example.test",
        labelKey: "events.detail.upstream.links.externalURL",
      },
      {
        key: "generatorURL",
        href: "https://prometheus.example.test/graph?g0.expr=up",
        host: "prometheus.example.test",
        labelKey: "events.detail.upstream.links.generatorURL",
      },
    ]);
    expect(upstream?.metadata.map((entry) => entry.key)).toEqual([
      "provider",
      "parserVersion",
      "alertCount",
      "receiver",
      "groupKey",
      "payloadHash",
    ]);
    expect(upstream?.metadata.map((entry) => entry.value)).toEqual([
      "alertmanager",
      "1",
      "2",
      "oncall",
      '{}:{alertname="DiskFull"}',
      "abc123",
    ]);
  });

  it("refuses non-http protocols instead of rendering an executable anchor", () => {
    const upstream = buildEventUpstreamSource({
      externalURL: "javascript:alert(1)",
      generatorURL: "data:text/html,<script>alert(1)</script>",
    });

    expect(upstream?.links).toEqual([]);
    // The values are still visible as inert metadata for troubleshooting.
    expect(upstream?.metadata.map((entry) => entry.key).sort()).toEqual([
      "externalURL",
      "generatorURL",
    ]);
  });

  it("strips credentials embedded in the URL", () => {
    const upstream = buildEventUpstreamSource({
      externalURL: "https://operator:secret@alertmanager.example.test/alerts",
    });

    const link = upstream?.links[0];
    expect(link?.href).toBe("https://alertmanager.example.test/alerts");
    expect(link?.href).not.toContain("operator");
    expect(link?.href).not.toContain("secret");
    expect(link?.host).toBe("alertmanager.example.test");
  });

  it("keeps plain http URLs, which self-hosted upstreams commonly use", () => {
    const upstream = buildEventUpstreamSource({
      externalURL: "http://grafana.internal:3000/alerting/list",
    });

    expect(upstream?.links[0]?.href).toBe("http://grafana.internal:3000/alerting/list");
    expect(upstream?.links[0]?.host).toBe("grafana.internal:3000");
  });

  it("keeps malformed URL strings as metadata instead of dropping them", () => {
    const upstream = buildEventUpstreamSource({
      provider: "grafana",
      externalURL: "not a url",
    });

    expect(upstream?.links).toEqual([]);
    expect(upstream?.metadata).toContainEqual({
      key: "externalURL",
      value: "not a url",
      labelKey: "events.detail.upstream.links.externalURL",
    });
  });

  it("shows unknown scalar provider fields with their raw keys", () => {
    const upstream = buildEventUpstreamSource({
      provider: "fastgpt",
      model: "speech-01-turbo",
      probeAttempts: 1,
      probeStatus: "green",
      nested: { ignored: true },
    });

    expect(upstream?.metadata.map((entry) => entry.key)).toEqual([
      "provider",
      "model",
      "probeAttempts",
      "probeStatus",
    ]);
    expect(upstream?.metadata.find((entry) => entry.key === "model")?.labelKey).toBeNull();
    expect(upstream?.metadata.some((entry) => entry.key === "nested")).toBe(false);
  });

  it("renders nothing when the parser recorded no metadata", () => {
    expect(buildEventUpstreamSource({})).toBeNull();
    expect(buildEventUpstreamSource({ nested: { ignored: true } })).toBeNull();
  });
});
