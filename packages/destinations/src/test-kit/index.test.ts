import { destinationSendInput, fakeFetch } from "@tocsin/destinations/test-kit";
import { describe, expect, it } from "vite-plus/test";

describe("destination test-kit", () => {
  // The import above is the subpath export check: adapter tests import the kit
  // through `@tocsin/destinations/test-kit`, never through the runtime entry.
  it("builds a complete send input from the sample fixture", () => {
    const input = destinationSendInput({
      destination: { kind: "slack", name: "Slack SRE" },
      config: { webhookUrl: "https://hooks.slack.test/example" },
    });

    expect(input).toMatchObject({
      eventId: "event-1",
      source: { id: "source-1", provider: "grafana", enabled: true },
      destination: { id: "dest-1", kind: "slack", name: "Slack SRE", enabled: true },
      normalizedEvent: { severity: "critical", status: "firing", labels: { service: "checkout" } },
      config: { webhookUrl: "https://hooks.slack.test/example" },
    });
    expect(input).not.toHaveProperty("payload");
    expect(input).not.toHaveProperty("presentation");
  });

  it("merges nested overrides without dropping the rest of the sample", () => {
    const input = destinationSendInput({
      destination: { kind: "email" },
      source: { name: "Uptime Kuma prod", provider: "uptime_kuma" },
      normalizedEvent: { title: "Checkout API unavailable", labels: { monitor: "login" } },
      payload: { heartbeat: { ping: 75 } },
      presentation: { locale: "zh-Hans", timeZone: "Asia/Shanghai" },
      config: {},
    });

    expect(input.source).toEqual({
      id: "source-1",
      name: "Uptime Kuma prod",
      provider: "uptime_kuma",
      enabled: true,
    });
    expect(input.destination).toMatchObject({ kind: "email", name: "Tocsin SRE" });
    expect(input.normalizedEvent).toMatchObject({
      title: "Checkout API unavailable",
      message: "p95 latency exceeded",
      labels: { monitor: "login" },
    });
    expect(input.payload).toEqual({ heartbeat: { ping: 75 } });
    expect(input.presentation).toEqual({ locale: "zh-Hans", timeZone: "Asia/Shanghai" });
  });

  it("answers with a 200 ok response and records the request", async () => {
    const fetch = fakeFetch();
    const response = await fetch("https://hooks.slack.test/example", { method: "POST" });

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("ok");
    expect(fetch.calls).toEqual([
      { url: "https://hooks.slack.test/example", init: { method: "POST" } },
    ]);
  });

  it("lets a handler answer each call individually", async () => {
    const fetch = fakeFetch((call) =>
      call.url.endsWith("/missing")
        ? { ok: false, status: 502, body: "bad gateway" }
        : { status: 202, body: "accepted" },
    );

    const accepted = await fetch("https://hooks.slack.test/example", {});
    const failed = await fetch("https://hooks.slack.test/missing", {});

    expect(accepted).toMatchObject({ ok: true, status: 202 });
    await expect(accepted.text()).resolves.toBe("accepted");
    expect(failed).toMatchObject({ ok: false, status: 502 });
    await expect(failed.text()).resolves.toBe("bad gateway");
    expect(fetch.calls).toHaveLength(2);
  });
});
