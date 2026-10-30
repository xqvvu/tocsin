import { describe, expect, it } from "vite-plus/test";

import type { DeliveryState } from "@tocsin/core";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const NOW = "2026-10-27T10:00:00.000Z";

/**
 * One event per severity, and deliveries in the three states the console
 * offers side by side. The single-value case is part of the fixture on purpose:
 * the filter accepts one value or several, and both have to reach the same
 * `IN` predicate, or a link written before the multi-select returns different
 * rows than the same selection made in the UI.
 */
async function repositoryWithSeverityFixtures(): Promise<
  ReturnType<typeof createSqliteRepositories>["history"]
> {
  const db = createSqliteDatabase({ databasePath: ":memory:" });
  await migrateSqliteDatabase(db);

  await db
    .insertInto("sources")
    .values({
      id: "src-1",
      name: "Prometheus",
      provider: "generic",
      token_hash: "hash",
      created_at: NOW,
      updated_at: NOW,
    })
    .execute();

  await db
    .insertInto("destinations")
    .values({
      id: "dest-pager",
      name: "Pager",
      kind: "generic_webhook" as const,
      created_at: NOW,
      updated_at: NOW,
    })
    .execute();

  const event = (
    id: string,
    severity: "critical" | "warning" | "info",
    status: "firing" | "resolved",
  ) => ({
    id,
    source_id: "src-1",
    fingerprint: `fp-${id}`,
    severity,
    status,
    title: id,
    message: id,
    labels_json: "{}",
    normalized_json: "{}",
    provider_metadata_json: "{}",
    raw_payload_json: "{}",
    raw_headers_json: "{}",
    received_at: NOW,
    occurred_at: NOW,
    created_at: NOW,
  });

  await db
    .insertInto("events")
    .values([
      event("event-critical", "critical", "firing"),
      event("event-warning", "warning", "firing"),
      event("event-info", "info", "resolved"),
    ])
    .execute();

  const delivery = (id: string, eventId: string, state: DeliveryState) => ({
    id,
    event_id: eventId,
    destination_id: "dest-pager",
    state,
    created_at: NOW,
    updated_at: NOW,
  });

  await db
    .insertInto("deliveries")
    .values([
      delivery("del-failed", "event-critical", "failed"),
      delivery("del-pending", "event-warning", "pending"),
      delivery("del-succeeded", "event-info", "succeeded"),
    ])
    .execute();

  return createSqliteRepositories(new SqliteRepositoryContext({ db })).history;
}

function eventIds(page: { items: Array<{ id: string }> }): string[] {
  return page.items.map((item) => item.id).sort();
}

describe("multi-value list filters", () => {
  it("matches any of several severities", async () => {
    const history = await repositoryWithSeverityFixtures();

    const page = await history.listEvents({ severity: ["critical", "warning"] });

    // Both lists and their totals run the same predicate; if they drifted, the
    // pager would promise rows the list never shows.
    expect(eventIds(page)).toEqual(["event-critical", "event-warning"]);
    expect(page.total).toBe(2);
  });

  it("keeps a single severity working exactly as before", async () => {
    const history = await repositoryWithSeverityFixtures();

    const page = await history.listEvents({ severity: "critical" });

    expect(eventIds(page)).toEqual(["event-critical"]);
    expect(page.total).toBe(1);
  });

  it("treats an empty selection as no filter", async () => {
    const history = await repositoryWithSeverityFixtures();

    const page = await history.listEvents({ severity: [] });

    // Clearing every checkbox must widen the list; matching nothing would
    // leave the operator on an empty page that looks like an outage.
    expect(page.total).toBe(3);
  });

  it("matches any of several delivery states", async () => {
    const history = await repositoryWithSeverityFixtures();

    const page = await history.listDeliveries({ state: ["failed", "pending"] });

    expect(page.items.map((item) => item.id).sort()).toEqual(["del-failed", "del-pending"]);
    expect(page.total).toBe(2);
  });

  it("keeps a single delivery state working exactly as before", async () => {
    const history = await repositoryWithSeverityFixtures();

    const page = await history.listDeliveries({ state: "failed" });

    expect(page.items.map((item) => item.id)).toEqual(["del-failed"]);
    expect(page.total).toBe(1);
  });

  it("matches any of several event severities on the deliveries list", async () => {
    const history = await repositoryWithSeverityFixtures();

    const page = await history.listDeliveries({ severity: ["critical", "warning"] });

    // The deliveries filter carries the same multi-select as events, but reads
    // severity through the joined event; the count has to answer it too.
    expect(page.items.map((item) => item.id).sort()).toEqual(["del-failed", "del-pending"]);
    expect(page.total).toBe(2);
  });

  it("treats an empty severity selection on deliveries as no filter", async () => {
    const history = await repositoryWithSeverityFixtures();

    const page = await history.listDeliveries({ severity: [] });

    expect(page.total).toBe(3);
  });

  it("matches any of several statuses on both lists", async () => {
    const history = await repositoryWithSeverityFixtures();

    const events = await history.listEvents({ status: ["resolved", "unknown"] });
    const deliveries = await history.listDeliveries({ status: ["resolved"] });

    expect(eventIds(events)).toEqual(["event-info"]);
    expect(deliveries.items.map((item) => item.id)).toEqual(["del-succeeded"]);
  });
});
