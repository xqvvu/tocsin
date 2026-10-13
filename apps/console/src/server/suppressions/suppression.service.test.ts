import { describe, expect, it } from "vite-plus/test";

import { RecordNotFoundError } from "#/infra/sqlite/errors";
import { openSqliteStore, type SqliteStore } from "#/infra/sqlite/store";
import { DomainValidationError } from "#/server/runtime/domain-errors";
import { SuppressionService } from "#/server/suppressions/suppression.service";

const NOW = "2026-10-12T08:00:00.000Z";
const WINDOW_START = "2026-10-12T09:00:00.000Z";
const WINDOW_END = "2026-10-12T11:00:00.000Z";
const INSIDE_WINDOW = "2026-10-12T10:00:00.000Z";

async function openTestService(): Promise<{ store: SqliteStore; service: SuppressionService }> {
  const store = await openSqliteStore({
    databasePath: ":memory:",
    now: () => NOW,
    ids: { suppression: () => "suppression-1", delivery: () => "delivery-1" },
  });
  const service = new SuppressionService({ store, now: () => NOW });

  return { store, service };
}

async function seedDeliveryTargets(store: SqliteStore): Promise<void> {
  await store.sources.create({
    id: "source-1",
    name: "Prometheus",
    provider: "generic",
    tokenHash: "hash",
  });
  await store.destinations.create({
    id: "destination-1",
    name: "Primary webhook",
    kind: "generic_webhook",
    config: { url: "https://example.test/hooks/primary" },
  });
  await store.routes.create({
    id: "route-1",
    name: "All alerts",
    destinationIds: ["destination-1"],
  });
}

async function enqueueSuppressedDelivery(store: SqliteStore): Promise<string> {
  const event = await store.intake.recordEvent({
    sourceId: "source-1",
    idempotencyKey: "request-1",
    normalized: {
      title: "Disk usage above 95%",
      message: "disk usage is above 95%",
      severity: "critical",
      status: "firing",
      fingerprint: "disk:full",
      labels: { env: "prod" },
      occurredAt: INSIDE_WINDOW,
    },
    rawPayload: {},
  });
  const enqueue = await store.deliveries.enqueueForEvent({
    event,
    matches: [{ routeId: "route-1", destinationIds: ["destination-1"] }],
    dedupeWindowStartsAt: "2026-10-12T07:00:00.000Z",
    now: INSIDE_WINDOW,
  });

  return enqueue.created[0]!.id;
}

describe("suppression service", () => {
  it("defaults the window start to now and rejects an inverted window", async () => {
    const { store, service } = await openTestService();
    await seedDeliveryTargets(store);

    const created = await service.createSuppression({
      name: "October database migration",
      kind: "maintenance_window",
      reason: "CHG-1234",
      matcher: { destinationIds: ["destination-1"] },
      endsAt: WINDOW_END,
    });

    expect(created.startsAt).toBe(NOW);
    expect(created.endsAt).toBe(WINDOW_END);
    expect(created.enabled).toBe(true);

    await expect(
      service.createSuppression({
        name: "Backwards",
        kind: "silence",
        startsAt: WINDOW_END,
        endsAt: WINDOW_START,
      }),
    ).rejects.toBeInstanceOf(DomainValidationError);
  });

  it("rejects matchers that reference unknown sources or destinations", async () => {
    const { service } = await openTestService();

    await expect(
      service.createSuppression({
        name: "Ghost destination",
        kind: "silence",
        matcher: { destinationIds: ["destination-missing"] },
        startsAt: WINDOW_START,
        endsAt: WINDOW_END,
      }),
    ).rejects.toBeInstanceOf(DomainValidationError);

    await expect(
      service.createSuppression({
        name: "Ghost source",
        kind: "silence",
        matcher: { sourceIds: ["source-missing"] },
        startsAt: WINDOW_START,
        endsAt: WINDOW_END,
      }),
    ).rejects.toBeInstanceOf(DomainValidationError);
  });

  it("validates the window against the stored rule when only one bound changes", async () => {
    const { service } = await openTestService();
    const created = await service.createSuppression({
      name: "Migration",
      kind: "maintenance_window",
      startsAt: WINDOW_START,
      endsAt: WINDOW_END,
    });

    await expect(
      service.updateSuppression({ id: created.id, startsAt: "2026-10-12T12:00:00.000Z" }),
    ).rejects.toBeInstanceOf(DomainValidationError);
  });

  it("raises NOT_FOUND for unknown rules instead of silently succeeding", async () => {
    const { service } = await openTestService();

    await expect(service.getSuppression("suppression-missing")).rejects.toBeInstanceOf(
      RecordNotFoundError,
    );
    await expect(service.deleteSuppression({ id: "suppression-missing" })).rejects.toBeInstanceOf(
      RecordNotFoundError,
    );
    await expect(service.listSuppressionHits({ id: "suppression-missing" })).rejects.toBeInstanceOf(
      RecordNotFoundError,
    );
  });

  it("returns the silenced deliveries as the rule's hits, keeping the reason after deletion", async () => {
    const { store, service } = await openTestService();
    await seedDeliveryTargets(store);
    const rule = await service.createSuppression({
      name: "October database migration",
      kind: "maintenance_window",
      matcher: { destinationIds: ["destination-1"] },
      startsAt: WINDOW_START,
      endsAt: WINDOW_END,
    });
    const deliveryId = await enqueueSuppressedDelivery(store);

    const hits = await service.listSuppressionHits({ id: rule.id });

    expect(hits.total).toBe(1);
    expect(hits.items).toHaveLength(1);
    expect(hits.items[0]).toMatchObject({
      id: deliveryId,
      destinationName: "Primary webhook",
      state: "suppressed",
    });

    await service.deleteSuppression({ id: rule.id });

    // The row no longer points at the deleted rule, but the audit snapshot is
    // still readable on the delivery itself.
    const detail = await store.deliveries.get(deliveryId);
    expect(detail?.job).toMatchObject({
      state: "suppressed",
      suppressionId: null,
      suppressedAt: INSIDE_WINDOW,
      suppressReason: expect.stringContaining("October database migration"),
    });
  });
});
