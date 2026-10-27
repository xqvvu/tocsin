import { describe, expect, it } from "vite-plus/test";

import { eventDetailUrl } from "#/lib/event-url";

describe("event detail url", () => {
  it("joins the public base URL with the event route", () => {
    expect(eventDetailUrl("https://tocsin.example.test", "event-1")).toBe(
      "https://tocsin.example.test/events/event-1",
    );
  });

  it("does not double the separator when the base URL ends with slashes", () => {
    expect(eventDetailUrl("https://tocsin.example.test///", "event-1")).toBe(
      "https://tocsin.example.test/events/event-1",
    );
  });

  it("keeps a base URL sub-path", () => {
    expect(eventDetailUrl("https://example.test/tocsin", "event-1")).toBe(
      "https://example.test/tocsin/events/event-1",
    );
  });

  it("encodes event ids so ids with reserved characters stay one path segment", () => {
    expect(eventDetailUrl("https://tocsin.example.test", "event/1?x=1")).toBe(
      "https://tocsin.example.test/events/event%2F1%3Fx%3D1",
    );
  });

  it("returns undefined when the deployment has no public URL", () => {
    expect(eventDetailUrl(undefined, "event-1")).toBeUndefined();
    expect(eventDetailUrl("", "event-1")).toBeUndefined();
    expect(eventDetailUrl("   ", "event-1")).toBeUndefined();
  });
});
