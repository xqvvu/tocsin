import { describe, expect, it } from "vite-plus/test";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const FINGERPRINT = "checkout:unavailable";

/**
 * Deliveries are filtered by the fingerprint of the *event* they came from, so
 * the fixtures mirror the events-list suite: two repeats of one alert, a longer
 * fingerprint with the same prefix, an unrelated alert whose text quotes the
 * fingerprint, and the same fingerprint on another source.
 *
 * The recurrence view answers "every notification this alert ever sent", so
 * only the exact-fingerprint rows belong in the result.
 */
async function repositoryWithFingerprintFixtures(): Promise<
  ReturnType<typeof createSqliteRepositories>["history"]
> {
  const db = createSqliteDatabase({ databasePath: ":memory:" });
  await migrateSqliteDatabase(db);

  await db
    .insertInto("sources")
    .values([
      {
        id: "src-1",
        name: "Prometheus",
        provider: "generic",
        token_hash: "hash-1",
        created_at: "2026-10-28T00:00:00.000Z",
        updated_at: "2026-10-28T00:00:00.000Z",
      },
      {
        id: "src-2",
        name: "Grafana",
        provider: "generic",
        token_hash: "hash-2",
        created_at: "2026-10-28T00:00:00.000Z",
        updated_at: "2026-10-28T00:00:00.000Z",
      },
    ])
    .execute();

  await db
    .insertInto("destinations")
    .values([
      {
        id: "dest-primary",
        name: "Primary on-call",
        kind: "feishu",
        created_at: "2026-10-28T00:00:00.000Z",
        updated_at: "2026-10-28T00:00:00.000Z",
      },
      {
        id: "dest-backup",
        name: "Backup on-call",
        kind: "slack",
        created_at: "2026-10-28T00:00:00.000Z",
        updated_at: "2026-10-28T00:00:00.000Z",
      },
    ])
    .execute();

  const event = (
    id: string,
    sourceId: string,
    fingerprint: string,
    title: string,
    receivedAt: string,
  ) => ({
    id,
    source_id: sourceId,
    fingerprint,
    severity: "critical" as const,
    status: "firing" as const,
    title,
    message: title,
    labels_json: "{}",
    normalized_json: "{}",
    provider_metadata_json: "{}",
    raw_payload_json: "{}",
    raw_headers_json: "{}",
    received_at: receivedAt,
    occurred_at: receivedAt,
    created_at: receivedAt,
  });

  await db
    .insertInto("events")
    .values([
      event(
        "event-repeat-newer",
        "src-1",
        FINGERPRINT,
        "Checkout is down",
        "2026-10-28T03:00:00.000Z",
      ),
      event(
        "event-repeat-older",
        "src-1",
        FINGERPRINT,
        "Checkout is down",
        "2026-10-28T01:00:00.000Z",
      ),
      event(
        "event-longer-fingerprint",
        "src-1",
        `${FINGERPRINT}:eu`,
        "Checkout is down (EU)",
        "2026-10-28T02:30:00.000Z",
      ),
      event(
        "event-text-only",
        "src-1",
        "other:alert",
        `Runbook mentions ${FINGERPRINT}`,
        "2026-10-28T02:15:00.000Z",
      ),
      event(
        "event-other-source",
        "src-2",
        FINGERPRINT,
        "Checkout is down",
        "2026-10-28T02:45:00.000Z",
      ),
    ])
    .execute();

  // One delivery per event, plus a second fan-out for the newest repeat so the
  // filter cannot accidentally assume "one delivery per occurrence".
  await db
    .insertInto("deliveries")
    .values([
      {
        id: "del-repeat-newer-primary",
        event_id: "event-repeat-newer",
        destination_id: "dest-primary",
        state: "succeeded" as const,
        attempt_count: 1,
        created_at: "2026-10-28T03:00:00.000Z",
        updated_at: "2026-10-28T03:00:00.000Z",
      },
      {
        id: "del-repeat-newer-backup",
        event_id: "event-repeat-newer",
        destination_id: "dest-backup",
        state: "failed" as const,
        attempt_count: 3,
        created_at: "2026-10-28T03:00:01.000Z",
        updated_at: "2026-10-28T03:00:01.000Z",
      },
      {
        id: "del-repeat-older",
        event_id: "event-repeat-older",
        destination_id: "dest-primary",
        state: "succeeded" as const,
        attempt_count: 1,
        created_at: "2026-10-28T01:00:00.000Z",
        updated_at: "2026-10-28T01:00:00.000Z",
      },
      {
        id: "del-longer-fingerprint",
        event_id: "event-longer-fingerprint",
        destination_id: "dest-primary",
        state: "succeeded" as const,
        attempt_count: 1,
        created_at: "2026-10-28T02:30:00.000Z",
        updated_at: "2026-10-28T02:30:00.000Z",
      },
      {
        id: "del-text-only",
        event_id: "event-text-only",
        destination_id: "dest-primary",
        state: "succeeded" as const,
        attempt_count: 1,
        created_at: "2026-10-28T02:15:00.000Z",
        updated_at: "2026-10-28T02:15:00.000Z",
      },
      {
        id: "del-other-source",
        event_id: "event-other-source",
        destination_id: "dest-primary",
        state: "succeeded" as const,
        attempt_count: 1,
        created_at: "2026-10-28T02:45:00.000Z",
        updated_at: "2026-10-28T02:45:00.000Z",
      },
    ])
    .execute();

  return createSqliteRepositories(new SqliteRepositoryContext({ db })).history;
}

function deliveryIds(page: { items: Array<{ id: string }> }): string[] {
  return page.items.map((item) => item.id).sort();
}

describe("deliveries filtered by exact fingerprint", () => {
  it("returns every delivery of every occurrence, and nothing else", async () => {
    const history = await repositoryWithFingerprintFixtures();

    const page = await history.listDeliveries({ fingerprint: FINGERPRINT });

    // The prefix-extended fingerprint and the runbook title are excluded: this
    // is equality on the event's fingerprint, not the search box's substring
    // match. Both repeat occurrences contribute, including the second fan-out
    // of the newest one.
    expect(deliveryIds(page)).toEqual([
      "del-other-source",
      "del-repeat-newer-backup",
      "del-repeat-newer-primary",
      "del-repeat-older",
    ]);
    expect(page.total).toBe(4);
  });

  it("pairs with the source the recurrence view links from", async () => {
    const history = await repositoryWithFingerprintFixtures();

    const page = await history.listDeliveries({ sourceId: "src-1", fingerprint: FINGERPRINT });

    expect(deliveryIds(page)).toEqual([
      "del-repeat-newer-backup",
      "del-repeat-newer-primary",
      "del-repeat-older",
    ]);
    expect(page.total).toBe(3);
  });

  it("stays narrower than the substring search", async () => {
    const history = await repositoryWithFingerprintFixtures();

    const exact = await history.listDeliveries({ fingerprint: FINGERPRINT });
    const searched = await history.listDeliveries({ q: FINGERPRINT });

    // The behavior the filter exists to fix: `q` also matches the longer
    // fingerprint and the title that quotes it, on both sources.
    expect(searched.total).toBe(6);
    expect(exact.total).toBeLessThan(searched.total);
  });

  it("keeps list and total on the same predicate across pages", async () => {
    const history = await repositoryWithFingerprintFixtures();

    const firstPage = await history.listDeliveries({ fingerprint: FINGERPRINT, limit: 2 });
    const secondPage = await history.listDeliveries({
      fingerprint: FINGERPRINT,
      limit: 2,
      page: 2,
    });

    expect(firstPage.items.map((item) => item.id)).toEqual([
      "del-repeat-newer-backup",
      "del-repeat-newer-primary",
    ]);
    expect(secondPage.items.map((item) => item.id)).toEqual([
      "del-other-source",
      "del-repeat-older",
    ]);
    // The footer must not claim rows the filter never returns.
    expect(firstPage.total).toBe(4);
    expect(secondPage.total).toBe(4);
  });

  it("combines with the delivery state dimension", async () => {
    const history = await repositoryWithFingerprintFixtures();

    const page = await history.listDeliveries({ fingerprint: FINGERPRINT, state: "failed" });

    expect(deliveryIds(page)).toEqual(["del-repeat-newer-backup"]);
    expect(page.total).toBe(1);
  });

  it("does not filter when the value is absent", async () => {
    const history = await repositoryWithFingerprintFixtures();

    const page = await history.listDeliveries({});

    expect(page.total).toBe(6);
  });
});
