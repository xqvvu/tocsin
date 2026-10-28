import { describe, expect, it, vi } from "vite-plus/test";

import type { JsonObject } from "@tocsin/core";
import { createDefaultDestinationRegistry } from "@tocsin/destinations";
import { createDefaultProviderRegistry, type ProviderRegistry } from "@tocsin/providers";

import { RecordNotFoundError } from "#/infra/sqlite/errors";
import { openSqliteStore } from "#/infra/sqlite/store";
import { SourceRehearsalService } from "#/server/sources/source-rehearsal.service";

const now = "2026-10-28T12:00:00.000Z";

const alertPayload = {
  id: "evt-123",
  title: "Checkout unavailable",
  message: "checkout returned 503",
  severity: "high",
  status: "triggered",
  labels: { service: "checkout", env: "prod" },
  occurredAt: "2026-10-28T11:59:00.000Z",
};

async function createHarness(
  options: {
    routeEnabled?: boolean;
    providers?: ProviderRegistry;
    /** Route targets, so a case can point at a destination that was never created. */
    routeDestinationIds?: string[];
    /** Stored destination config, so a case can exercise an unparseable config. */
    destinationConfig?: JsonObject;
    /** Skips creating `destination-1`, keeping only the route reference to it. */
    skipDestination?: boolean;
  } = {},
) {
  const store = await openSqliteStore({ databasePath: ":memory:", now: () => now });
  const destinations = createDefaultDestinationRegistry();
  const service = new SourceRehearsalService({
    store,
    providers: options.providers ?? createDefaultProviderRegistry(),
    destinations,
    now: () => now,
  });

  await store.sources.create({
    id: "source-1",
    name: "Custom emitter",
    provider: "generic",
    config: {},
    tokenHash: "unused-in-rehearsal",
  });
  if (!options.skipDestination) {
    await store.destinations.create({
      id: "destination-1",
      name: "Ops webhook",
      kind: "generic_webhook",
      config: options.destinationConfig ?? { url: "https://example.test/hook" },
    });
  }
  await store.routes.create({
    id: "route-1",
    name: "Critical checkout",
    enabled: options.routeEnabled ?? true,
    rule: {
      severities: ["critical"],
      labels: [{ key: "service", operator: "equals", value: "checkout" }],
    },
    destinationIds: options.routeDestinationIds ?? ["destination-1"],
  });

  return { store, destinations, service };
}

describe("source rehearsal service", () => {
  it("parses the payload, explains every route, and renders matched destinations", async () => {
    const { store, destinations, service } = await createHarness();
    const recordEvent = vi.spyOn(store.intake, "recordEvent");
    const enqueue = vi.spyOn(store.deliveries, "enqueueForEvent");
    const send = vi.spyOn(destinations, "send");

    const result = await service.rehearseSource({
      sourceId: "source-1",
      payload: alertPayload,
    });

    expect(result.parse).toMatchObject({
      ok: true,
      // PRD acceptance 1: the provider metadata travels back with the event.
      providerMetadata: { provider: "generic" },
      normalizedEvent: {
        title: "Checkout unavailable",
        severity: "critical",
        status: "firing",
        labels: { service: "checkout", env: "prod", severity: "high", status: "triggered" },
      },
    });
    expect(result.receivedAt).toBe(now);
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0]).toMatchObject({
      routeId: "route-1",
      matched: true,
      destinationIds: ["destination-1"],
    });
    expect(result.routes[0]?.checks.map((check) => check.field)).toEqual([
      "enabled",
      "source",
      "severity",
      "status",
      "label",
      "title",
      "message",
    ]);
    expect(result.renders).toHaveLength(1);
    expect(result.renders[0]).toMatchObject({
      destinationId: "destination-1",
      destinationName: "Ops webhook",
      enabled: true,
      ok: true,
      errorMessage: null,
    });
    expect(result.renders[0]?.renderedPayload).toContain("Checkout unavailable");

    // The rehearsal is read-only: no Event, no Delivery, no job, and no real
    // outbound request even though the target rendered successfully.
    expect(recordEvent).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("returns a redacted parse failure without evaluating routes or rendering", async () => {
    const parse = vi.fn<ProviderRegistry["parse"]>(() => ({
      ok: false,
      reason: "invalid_payload",
      message: "unsupported body token=super-secret-value",
    }));
    const { destinations, service } = await createHarness({
      providers: { parse } as unknown as ProviderRegistry,
    });
    const preview = vi.spyOn(destinations, "preview");

    const result = await service.rehearseSource({
      sourceId: "source-1",
      payload: { hello: "world" },
    });

    expect(result.parse).toMatchObject({ ok: false, reason: "invalid_payload" });
    if (!result.parse.ok) {
      expect(result.parse.message).not.toContain("super-secret-value");
    }
    expect(result.routes).toEqual([]);
    expect(result.renders).toEqual([]);
    expect(preview).not.toHaveBeenCalled();
  });

  it("reports a rejected Source config as configuration_error", async () => {
    const { service } = await createHarness({
      providers: {
        parse: () => {
          throw new Error("Invalid source config");
        },
      } as unknown as ProviderRegistry,
    });

    const result = await service.rehearseSource({
      sourceId: "source-1",
      payload: alertPayload,
    });

    expect(result.parse).toEqual({
      ok: false,
      reason: "configuration_error",
      message: "Invalid source config",
    });
    expect(result.routes).toEqual([]);
  });

  it("keeps the route visible but does not render targets when the route is disabled", async () => {
    const { destinations, service } = await createHarness({ routeEnabled: false });
    const preview = vi.spyOn(destinations, "preview");

    const result = await service.rehearseSource({
      sourceId: "source-1",
      payload: alertPayload,
    });

    expect(result.routes).toHaveLength(1);
    expect(result.routes[0]).toMatchObject({ routeId: "route-1", matched: false });
    expect(result.routes[0]?.checks[0]).toMatchObject({ field: "enabled", matched: false });
    expect(result.renders).toEqual([]);
    expect(preview).not.toHaveBeenCalled();
  });

  it("reports a route target that no longer exists", async () => {
    const { service } = await createHarness({
      routeDestinationIds: ["destination-missing"],
      skipDestination: true,
    });

    const result = await service.rehearseSource({ sourceId: "source-1", payload: alertPayload });

    expect(result.renders).toEqual([
      {
        destinationId: "destination-missing",
        destinationName: "destination-missing",
        enabled: false,
        ok: false,
        renderedPayload: "",
        errorMessage: "Destination not found: destination-missing",
      },
    ]);
  });

  it("reports a destination whose stored config cannot be parsed", async () => {
    const { service } = await createHarness({ destinationConfig: {} });

    const result = await service.rehearseSource({ sourceId: "source-1", payload: alertPayload });

    expect(result.renders).toHaveLength(1);
    expect(result.renders[0]).toMatchObject({
      destinationId: "destination-1",
      ok: false,
      renderedPayload: "",
    });
    expect(result.renders[0]?.errorMessage).toBeTruthy();
  });

  it("rejects an oversized payload at the boundary", async () => {
    const { service } = await createHarness();

    await expect(
      service.rehearseSource({
        sourceId: "source-1",
        payload: { message: "x".repeat(300_000) },
      }),
    ).rejects.toThrow(/too large/);
  });

  it("raises RecordNotFoundError for an unknown source", async () => {
    const { service } = await createHarness();

    await expect(
      service.rehearseSource({ sourceId: "missing", payload: alertPayload }),
    ).rejects.toBeInstanceOf(RecordNotFoundError);
  });
});
