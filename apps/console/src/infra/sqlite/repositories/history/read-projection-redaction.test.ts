import { describe, expect, it } from "vite-plus/test";

import { openSqliteStore } from "#/infra/sqlite/store";

const now = "2026-10-20T00:00:00.000Z";

async function createStore() {
  let nextId = 0;

  return openSqliteStore({
    databasePath: ":memory:",
    now: () => now,
    ids: {
      event: () => `event-${++nextId}`,
      delivery: () => `delivery-${++nextId}`,
      attempt: () => `attempt-${++nextId}`,
    },
  });
}

describe("read projection redaction", () => {
  it("keeps credentials out of every event and delivery DTO", async () => {
    const store = await createStore();

    await store.sources.create({
      id: "source-1",
      name: "Generic source",
      provider: "generic",
      tokenHash: "token-hash",
    });
    await store.destinations.create({
      id: "destination-1",
      name: "Ops webhook",
      kind: "generic_webhook",
    });
    await store.routes.create({
      id: "route-1",
      name: "Ops route",
      rule: { severities: ["critical"] },
      destinationIds: ["destination-1"],
    });

    const event = await store.intake.recordEvent({
      sourceId: "source-1",
      idempotencyKey: null,
      normalized: {
        title: "Checkout failed Authorization: Bearer abcdefgh1234",
        message: "POST https://svc:supersecret@example.test/hook failed",
        severity: "critical",
        status: "firing",
        fingerprint: "checkout:unavailable",
        labels: {
          service: "checkout",
          authorization: "Bearer abcdefgh1234",
          note: "disk-space-low",
        },
        occurredAt: now,
      },
      providerMetadata: {
        externalURL: "https://grafana:supersecret@grafana.test/d/abc",
        receiver: "ops-webhook",
        token: "plain-token",
      },
      rawPayload: { token: "upstream-secret", monitor: "checkout" },
      rawHeaders: { Authorization: "Bearer abcdefgh1234", "X-Request-Id": "req-1" },
      routeMatches: [
        {
          routeId: "route-1",
          routeName: "Ops route",
          matched: true,
          destinationIds: ["destination-1"],
          checks: [
            {
              field: "title",
              matched: true,
              detail: "Expected title to contain Checkout",
              condition: "compare",
              expected: ["Checkout"],
              actual: "Checkout failed Authorization: Bearer abcdefgh1234",
            },
          ],
        },
      ],
      receivedAt: now,
    });

    const events = await store.history.listEvents();

    expect(events.items[0].title).toBe("Checkout failed Authorization: [REDACTED]");
    expect(JSON.stringify(events)).not.toContain("abcdefgh1234");

    const detail = await store.history.getEventDetail(event.id);

    expect(detail?.event.normalized.message).toBe(
      "POST https://svc:[REDACTED]@example.test/hook failed",
    );
    expect(detail?.event.normalized.labels).toEqual({
      service: "checkout",
      authorization: "[REDACTED]",
      note: "disk-space-low",
    });
    expect(detail?.event.providerMetadata).toEqual({
      externalURL: "https://grafana:[REDACTED]@grafana.test/d/abc",
      receiver: "ops-webhook",
      token: "[REDACTED]",
    });
    expect(detail?.event.rawPayload).toEqual({ token: "[REDACTED]", monitor: "checkout" });
    expect(detail?.event.rawHeaders).toEqual({
      Authorization: "[REDACTED]",
      "X-Request-Id": "req-1",
    });
    expect(detail?.routeMatches[0].checks[0].actual).toBe(
      "Checkout failed Authorization: [REDACTED]",
    );
    expect(detail?.event.routeMatches?.[0].checks[0].actual).toBe(
      "Checkout failed Authorization: [REDACTED]",
    );
    expect(JSON.stringify(detail)).not.toContain("supersecret");
    expect(JSON.stringify(detail)).not.toContain("upstream-secret");
    expect(JSON.stringify(detail)).not.toContain("plain-token");

    const enqueued = await store.deliveries.enqueueForEvent({
      event,
      matches: [{ routeId: "route-1", destinationIds: ["destination-1"] }],
      dedupeWindowStartsAt: now,
      now,
    });
    const deliveryId = enqueued.created[0].id;

    // New sends render from a redacted input, but rows written before that
    // projection existed may still carry the raw event copy.
    await store.deliveries.markSucceeded({
      deliveryId,
      attemptId: "attempt-pre-projection",
      renderedPayload: {
        text: "Checkout failed Authorization: Bearer abcdefgh1234",
        note: "password=stored-secret",
        token: "rendered-secret",
      },
      startedAt: now,
      finishedAt: now,
    });

    const deliveryDetail = await store.deliveries.get(deliveryId);

    expect(deliveryDetail?.renderedPayload).toEqual({
      text: "Checkout failed Authorization: [REDACTED]",
      note: "password=[REDACTED]",
      token: "[REDACTED]",
    });
    expect(deliveryDetail?.event.normalized.labels.authorization).toBe("[REDACTED]");
    expect(JSON.stringify(deliveryDetail)).not.toContain("abcdefgh1234");
    expect(JSON.stringify(deliveryDetail)).not.toContain("rendered-secret");

    const deliveries = await store.history.listDeliveries();

    expect(deliveries.items[0].eventTitle).toBe("Checkout failed Authorization: [REDACTED]");
    expect(JSON.stringify(deliveries)).not.toContain("abcdefgh1234");

    await store.close();
  });
});
