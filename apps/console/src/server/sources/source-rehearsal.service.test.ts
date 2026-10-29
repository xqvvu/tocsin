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
    /** Title needles, so a case can prove matching ran before display redaction. */
    routeTitleContains?: string[];
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
      titleContains: options.routeTitleContains ?? [],
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
    expect(result.delivery).toEqual({ paused: false, pausedAt: null });
    expect(result.renders).toHaveLength(1);
    expect(result.renders[0]).toMatchObject({
      destinationId: "destination-1",
      destinationName: "Ops webhook",
      enabled: true,
      ok: true,
      errorMessage: null,
      // Every gate is open: the real chain would deliver this alert.
      verdict: "deliver",
      suppression: null,
    });
    expect(result.renders[0]?.renderedPayload).toContain("Checkout unavailable");

    // The rehearsal is read-only: no Event, no Delivery, no job, and no real
    // outbound request even though the target rendered successfully.
    expect(recordEvent).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("projects the parsed event, metadata, and match evidence for display", async () => {
    const parse = vi.fn<ProviderRegistry["parse"]>(() => ({
      ok: true,
      idempotencyKey: "evt-123",
      normalized: {
        title: "Checkout token=super-secret-value failed",
        message: "upstream returned 503",
        severity: "critical",
        status: "firing",
        fingerprint: "checkout-fingerprint",
        labels: { service: "checkout", authorization: "Bearer abcdefgh1234" },
        occurredAt: "2026-10-28T11:59:00.000Z",
      },
      providerMetadata: { provider: "generic", accessToken: "abc123" },
    }));
    const { destinations, store, service } = await createHarness({
      providers: { parse } as unknown as ProviderRegistry,
      routeTitleContains: ["Checkout"],
    });
    const recordEvent = vi.spyOn(store.intake, "recordEvent");
    const enqueue = vi.spyOn(store.deliveries, "enqueueForEvent");
    const preview = vi.spyOn(destinations, "preview");
    const send = vi.spyOn(destinations, "send");

    const result = await service.rehearseSource({ sourceId: "source-1", payload: alertPayload });

    expect(result.parse.ok).toBe(true);
    if (!result.parse.ok) {
      throw new Error("expected a successful parse");
    }

    // Credential-shaped values are replaced; benign values and the fingerprint
    // that route matching and dedupe rely on stay intact.
    expect(result.parse.normalizedEvent.title).toContain("[REDACTED]");
    expect(result.parse.normalizedEvent.title).not.toContain("super-secret-value");
    expect(result.parse.normalizedEvent.labels.authorization).toBe("[REDACTED]");
    expect(result.parse.normalizedEvent.labels.service).toBe("checkout");
    expect(result.parse.normalizedEvent.fingerprint).toBe("checkout-fingerprint");
    expect(result.parse.providerMetadata).toEqual({
      provider: "generic",
      accessToken: "[REDACTED]",
    });

    // Matching ran on the raw event — the title needle still matched — while
    // the evidence that leaves the server carries the same projection.
    expect(result.routes[0]?.matched).toBe(true);
    const titleCheck = result.routes[0]?.checks.find((check) => check.field === "title");
    expect(titleCheck?.actual).toContain("[REDACTED]");
    expect(titleCheck?.actual).not.toContain("super-secret-value");
    expect(titleCheck?.expected).toEqual(["Checkout"]);
    expect(result.routes[0]?.checks.find((check) => check.field === "label")?.actual).toBe(
      "checkout",
    );

    // The preview renders what production would send, not the raw secret.
    const previewInput = preview.mock.calls[0]?.[1] as
      | { normalizedEvent: { title: string } }
      | undefined;
    expect(previewInput?.normalizedEvent.title).not.toContain("super-secret-value");
    expect(result.renders[0]?.renderedPayload).not.toContain("super-secret-value");

    // Still read-only: no Event, no Delivery, no outbound request.
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
        verdict: "destination_disabled",
        suppression: null,
        dedupe: {
          state: "would_deliver",
          windowMs: 300_000,
          windowStartsAt: "2026-10-28T11:55:00.000Z",
          matchedPairCount: 1,
          dedupedPairCount: 0,
          routeId: null,
          routeName: null,
          firstEventId: null,
        },
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

  it("discloses the silence rule the real enqueue would apply", async () => {
    const { destinations, service, store } = await createHarness();
    await store.suppressions.create({
      id: "suppression-1",
      name: "Checkout maintenance",
      kind: "maintenance_window",
      matcher: { severities: ["critical"] },
      startsAt: "2026-10-28T11:00:00.000Z",
      endsAt: "2026-10-28T13:00:00.000Z",
    });
    const enqueue = vi.spyOn(store.deliveries, "enqueueForEvent");
    const preview = vi.spyOn(destinations, "preview");
    const send = vi.spyOn(destinations, "send");

    const result = await service.rehearseSource({ sourceId: "source-1", payload: alertPayload });

    expect(result.renders[0]).toMatchObject({
      destinationId: "destination-1",
      verdict: "suppressed",
      suppression: {
        id: "suppression-1",
        name: "Checkout maintenance",
        kind: "maintenance_window",
      },
    });
    expect(result.renders[0]?.suppression?.reason).toContain("Checkout maintenance");
    expect(
      result.renders[0]?.suppression?.checks.find((check) => check.field === "severity"),
    ).toMatchObject({ matched: true, actual: "critical" });

    // The preview still renders — the operator is validating the payload — but
    // the verdict says production would never send it.
    expect(preview).toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("redacts the values it discloses in silence checks", async () => {
    const parse = vi.fn<ProviderRegistry["parse"]>(() => ({
      ok: true,
      idempotencyKey: "evt-123",
      normalized: {
        title: "Checkout token=super-secret-value failed",
        message: "upstream returned 503",
        severity: "critical",
        status: "firing",
        fingerprint: "checkout-fingerprint",
        labels: { service: "checkout", authorization: "Bearer abcdefgh1234" },
        occurredAt: "2026-10-28T11:59:00.000Z",
      },
      providerMetadata: {},
    }));
    const { service, store } = await createHarness({
      providers: { parse } as unknown as ProviderRegistry,
      routeTitleContains: ["Checkout"],
    });
    await store.suppressions.create({
      id: "suppression-1",
      name: "Checkout freeze",
      kind: "silence",
      matcher: {
        titleContains: ["Checkout"],
        labels: [{ key: "authorization", operator: "equals", value: "Bearer abcdefgh1234" }],
      },
      startsAt: "2026-10-28T11:00:00.000Z",
      endsAt: "2026-10-28T13:00:00.000Z",
    });

    const result = await service.rehearseSource({ sourceId: "source-1", payload: alertPayload });

    expect(result.renders[0]?.verdict).toBe("suppressed");
    const checks = result.renders[0]?.suppression?.checks ?? [];
    const titleCheck = checks.find((check) => check.field === "title");
    expect(titleCheck?.actual).toContain("[REDACTED]");
    expect(titleCheck?.actual).not.toContain("super-secret-value");
    expect(checks.find((check) => check.field === "label")?.actual).toBe("[REDACTED]");
  });

  it("discloses the dedupe window that would skip the delivery", async () => {
    const { service, store } = await createHarness();
    const previous = await store.intake.recordEvent({
      sourceId: "source-1",
      idempotencyKey: "evt-123",
      normalized: {
        title: "Checkout unavailable",
        message: "checkout returned 503",
        severity: "critical",
        status: "firing",
        fingerprint: "checkout",
        labels: { service: "checkout" },
        occurredAt: "2026-10-28T11:59:00.000Z",
      },
      rawPayload: {},
    });
    await store.deliveries.enqueueForEvent({
      event: previous,
      matches: [{ routeId: "route-1", destinationIds: ["destination-1"] }],
      dedupeWindowStartsAt: "2026-10-28T11:55:00.000Z",
      now: "2026-10-28T11:59:00.000Z",
    });

    const result = await service.rehearseSource({ sourceId: "source-1", payload: alertPayload });

    // The enqueue path skips the row before suppression, so a rendered preview
    // must not promise a delivery the window absorbs.
    expect(result.renders[0]).toMatchObject({
      verdict: "deduped",
      dedupe: {
        state: "would_dedupe",
        windowMs: 300_000,
        windowStartsAt: "2026-10-28T11:55:00.000Z",
        matchedPairCount: 1,
        dedupedPairCount: 1,
        routeId: "route-1",
        routeName: "Critical checkout",
        firstEventId: previous.id,
      },
    });
  });

  it("does not dedupe a key outside the window", async () => {
    const { service, store } = await createHarness();
    const previous = await store.intake.recordEvent({
      sourceId: "source-1",
      idempotencyKey: "evt-123",
      normalized: {
        title: "Checkout unavailable",
        message: "checkout returned 503",
        severity: "critical",
        status: "firing",
        fingerprint: "checkout",
        labels: { service: "checkout" },
        occurredAt: "2026-10-28T11:50:00.000Z",
      },
      rawPayload: {},
    });
    await store.deliveries.enqueueForEvent({
      event: previous,
      matches: [{ routeId: "route-1", destinationIds: ["destination-1"] }],
      dedupeWindowStartsAt: "2026-10-28T11:50:00.000Z",
      now: "2026-10-28T11:54:59.000Z",
    });

    const result = await service.rehearseSource({ sourceId: "source-1", payload: alertPayload });

    expect(result.renders[0]).toMatchObject({
      verdict: "deliver",
      dedupe: {
        state: "would_deliver",
        dedupedPairCount: 0,
        firstEventId: null,
      },
    });
  });

  it("reports a partial window hit only when some routes still deliver", async () => {
    const { service, store } = await createHarness();
    await store.routes.create({
      id: "route-2",
      name: "Secondary checkout",
      enabled: true,
      rule: {
        severities: ["critical"],
        labels: [{ key: "service", operator: "equals", value: "checkout" }],
        titleContains: [],
      },
      destinationIds: ["destination-1"],
    });
    const previous = await store.intake.recordEvent({
      sourceId: "source-1",
      idempotencyKey: "evt-123",
      normalized: {
        title: "Checkout unavailable",
        message: "checkout returned 503",
        severity: "critical",
        status: "firing",
        fingerprint: "checkout",
        labels: { service: "checkout" },
        occurredAt: "2026-10-28T11:59:00.000Z",
      },
      rawPayload: {},
    });
    // Only the first route saw the earlier event, so its pair is deduped while
    // the newly added route still creates a delivery.
    await store.deliveries.enqueueForEvent({
      event: previous,
      matches: [{ routeId: "route-1", destinationIds: ["destination-1"] }],
      dedupeWindowStartsAt: "2026-10-28T11:55:00.000Z",
      now: "2026-10-28T11:59:00.000Z",
    });

    const result = await service.rehearseSource({ sourceId: "source-1", payload: alertPayload });

    expect(result.renders[0]).toMatchObject({
      verdict: "deliver",
      dedupe: {
        state: "partially_deduped",
        matchedPairCount: 2,
        dedupedPairCount: 1,
        routeId: "route-1",
        firstEventId: previous.id,
      },
    });
  });

  it("marks dedupe as not applicable when the parser returns no idempotency key", async () => {
    const parse = vi.fn<ProviderRegistry["parse"]>(() => ({
      ok: true,
      idempotencyKey: "",
      normalized: {
        title: "Checkout unavailable",
        message: "checkout returned 503",
        severity: "critical",
        status: "firing",
        fingerprint: "checkout",
        labels: { service: "checkout" },
        occurredAt: "2026-10-28T11:59:00.000Z",
      },
      providerMetadata: {},
    }));
    const { service, store } = await createHarness({
      providers: { parse } as unknown as ProviderRegistry,
    });
    const findDedupeKeys = vi.spyOn(store.deliveries, "findDedupeKeys");

    const result = await service.rehearseSource({ sourceId: "source-1", payload: alertPayload });

    expect(result.renders[0]?.dedupe).toMatchObject({
      state: "not_applicable",
      dedupedPairCount: 0,
      firstEventId: null,
    });
    expect(findDedupeKeys).not.toHaveBeenCalled();
  });

  it("reports a global delivery pause as queued instead of delivered", async () => {
    const { service, store } = await createHarness();
    await store.settings.update({ deliveryPaused: true, actor: "oncall@example.test" });

    const result = await service.rehearseSource({ sourceId: "source-1", payload: alertPayload });

    expect(result.delivery).toEqual({ paused: true, pausedAt: now });
    expect(result.renders[0]).toMatchObject({ verdict: "queued_paused", suppression: null });
  });

  it("reports a disabled target as never claimed", async () => {
    const { service, store } = await createHarness();
    await store.destinations.setEnabled("destination-1", false);

    const result = await service.rehearseSource({ sourceId: "source-1", payload: alertPayload });

    expect(result.renders[0]).toMatchObject({
      enabled: false,
      verdict: "destination_disabled",
      suppression: null,
    });
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
