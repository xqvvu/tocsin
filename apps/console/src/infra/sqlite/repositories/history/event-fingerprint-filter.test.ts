import { describe, expect, it } from "vite-plus/test";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const FINGERPRINT = "checkout:unavailable";

/**
 * One repeat pair on the same source, plus the three ways a naive substring
 * match goes wrong: a longer fingerprint with the same prefix, unrelated text
 * that quotes the fingerprint, and the same fingerprint on another source.
 *
 * The recurrence view answers "every occurrence of exactly this alert on this
 * source", so only the repeat pair belongs in its full list.
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

  return createSqliteRepositories(new SqliteRepositoryContext({ db })).history;
}

function eventIds(page: { items: Array<{ id: string }> }): string[] {
  return page.items.map((item) => item.id).sort();
}

describe("events filtered by exact fingerprint", () => {
  it("returns only the events whose fingerprint equals the value", async () => {
    const history = await repositoryWithFingerprintFixtures();

    const page = await history.listEvents({ fingerprint: FINGERPRINT });

    // The prefix-extended fingerprint and the quoting title are both excluded:
    // this is equality, not the search box's substring match. The other source
    // is included because the filter itself carries no source dimension; the
    // recurrence-tab link pairs the two.
    expect(eventIds(page)).toEqual([
      "event-other-source",
      "event-repeat-newer",
      "event-repeat-older",
    ]);
    expect(page.total).toBe(3);
  });

  it("pairs with the source the recurrence view links from", async () => {
    const history = await repositoryWithFingerprintFixtures();

    const page = await history.listEvents({ sourceId: "src-1", fingerprint: FINGERPRINT });

    expect(eventIds(page)).toEqual(["event-repeat-newer", "event-repeat-older"]);
    expect(page.total).toBe(2);
  });

  it("keeps the newest occurrence first across pages", async () => {
    const history = await repositoryWithFingerprintFixtures();

    const firstPage = await history.listEvents({ fingerprint: FINGERPRINT, limit: 1 });
    const secondPage = await history.listEvents({ fingerprint: FINGERPRINT, limit: 1, page: 2 });

    expect(firstPage.items.map((item) => item.id)).toEqual(["event-repeat-newer"]);
    expect(secondPage.items.map((item) => item.id)).toEqual(["event-other-source"]);
    // The count answers the same predicate as the page, so the pagination
    // footer cannot claim more rows than the filter ever returns.
    expect(firstPage.total).toBe(3);
    expect(secondPage.total).toBe(3);
  });

  it("stays narrower than the substring search", async () => {
    const history = await repositoryWithFingerprintFixtures();

    const exact = await history.listEvents({ fingerprint: FINGERPRINT });
    const searched = await history.listEvents({ q: FINGERPRINT });

    // The behavior the filter exists to fix: `q` also matches the longer
    // fingerprint and the title that quotes it, on both sources.
    expect(searched.total).toBe(5);
    expect(exact.total).toBeLessThan(searched.total);
  });

  it("does not filter when the value is absent", async () => {
    const history = await repositoryWithFingerprintFixtures();

    const page = await history.listEvents({});

    expect(page.total).toBe(5);
  });
});
