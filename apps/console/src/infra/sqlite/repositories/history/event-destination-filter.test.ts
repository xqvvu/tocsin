import { describe, expect, it } from "vite-plus/test";

import type { DeliveryState } from "@tocsin/core";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const NOW = "2026-10-27T10:00:00.000Z";

/**
 * One event per way an alert can relate to a destination: a delivery in an
 * ordinary state, a delivery that was silenced, two targets at once, a target
 * that was retried (so one target holds two rows in different states), and none
 * at all (no route matched). The suppressed row is the important one for the
 * coverage question: it is still a delivery record, so "has delivery to
 * destination" must include it. The retried pair is what separates the
 * per-target state from the event-level one: `event-mixed`'s Pager send failed
 * while its email send succeeded.
 */
async function repositoryWithDestinationFixtures(): Promise<
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
    .values([
      {
        id: "dest-pager",
        name: "Pager",
        kind: "generic_webhook" as const,
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: "dest-email",
        name: "Email",
        kind: "email" as const,
        created_at: NOW,
        updated_at: NOW,
      },
    ])
    .execute();

  const event = (id: string, title: string) => ({
    id,
    source_id: "src-1",
    fingerprint: `fp-${id}`,
    severity: "critical" as const,
    status: "firing" as const,
    title,
    message: title,
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
      event("event-to-pager", "Pager was told"),
      event("event-to-email", "Only email was told"),
      event("event-suppressed-pager", "Pager delivery was silenced"),
      event("event-mixed", "Both targets were used"),
      event("event-pager-retried", "Pager was retried"),
      event("event-unrouted", "Nobody was told"),
    ])
    .execute();

  const delivery = (id: string, eventId: string, destinationId: string, state: DeliveryState) => ({
    id,
    event_id: eventId,
    destination_id: destinationId,
    state,
    created_at: NOW,
    updated_at: NOW,
  });

  await db
    .insertInto("deliveries")
    .values([
      delivery("del-pager", "event-to-pager", "dest-pager", "succeeded"),
      delivery("del-email", "event-to-email", "dest-email", "succeeded"),
      delivery("del-suppressed", "event-suppressed-pager", "dest-pager", "suppressed"),
      delivery("del-mixed-pager", "event-mixed", "dest-pager", "failed"),
      delivery("del-mixed-email", "event-mixed", "dest-email", "succeeded"),
      // The failed attempt stays in history after the retry succeeds, so a
      // per-target state filter must count the event once, not once per match.
      delivery("del-retried-failed", "event-pager-retried", "dest-pager", "failed"),
      delivery("del-retried-succeeded", "event-pager-retried", "dest-pager", "succeeded"),
    ])
    .execute();

  // Build the real repository set rather than hand-wiring the constructor, so
  // the test exercises the same object graph the app does.
  return createSqliteRepositories(new SqliteRepositoryContext({ db })).history;
}

function eventIds(page: { items: Array<{ id: string }> }): string[] {
  return page.items.map((item) => item.id).sort();
}

describe("events filtered by destination", () => {
  it("defaults to events that produced a delivery to the destination", async () => {
    const history = await repositoryWithDestinationFixtures();

    const page = await history.listEvents({ destinationId: "dest-pager" });

    // Any delivery state counts, including the silenced one: the filter asks
    // "was this target covered", not "did the message arrive".
    expect(eventIds(page)).toEqual([
      "event-mixed",
      "event-pager-retried",
      "event-suppressed-pager",
      "event-to-pager",
    ]);
    expect(page.total).toBe(4);
  });

  it("finds the events that never reached the destination", async () => {
    const history = await repositoryWithDestinationFixtures();

    const page = await history.listEvents({
      destinationId: "dest-pager",
      destinationMatch: "missing",
    });

    // An alert that reached nobody is exactly the case the delivery list cannot
    // show, so `missing` has to include it.
    expect(eventIds(page)).toEqual(["event-to-email", "event-unrouted"]);
    expect(page.total).toBe(2);
  });

  it("counts each event once when it has several deliveries", async () => {
    const history = await repositoryWithDestinationFixtures();

    const page = await history.listEvents({
      destinationId: "dest-pager",
      limit: 1,
      page: 1,
    });

    // `event-mixed` has a second delivery row to another destination; the
    // grouped page query and the count query must still see one row.
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(4);
  });

  it("returns an empty list for a destination id nothing was delivered to", async () => {
    const history = await repositoryWithDestinationFixtures();

    const delivered = await history.listEvents({ destinationId: "dest-missing" });
    const missing = await history.listEvents({
      destinationId: "dest-missing",
      destinationMatch: "missing",
    });

    expect(delivered.items).toHaveLength(0);
    expect(delivered.total).toBe(0);
    // Every event lacks a delivery to an unknown destination, so the reverse
    // filter is the whole history rather than an error.
    expect(missing.total).toBe(6);
  });

  it("combines the destination filter with the other event filters", async () => {
    const history = await repositoryWithDestinationFixtures();

    const page = await history.listEvents({
      destinationId: "dest-pager",
      destinationMatch: "missing",
      q: "Only email",
    });

    expect(eventIds(page)).toEqual(["event-to-email"]);
    expect(page.total).toBe(1);
  });
});

describe("events filtered by the delivery state to one destination", () => {
  it("keeps only events whose delivery to that destination is in the state", async () => {
    const history = await repositoryWithDestinationFixtures();

    const page = await history.listEvents({
      destinationId: "dest-pager",
      destinationOutcome: "failed",
    });

    // `event-pager-retried` matches through its failed first attempt even
    // though a later attempt succeeded.
    expect(eventIds(page)).toEqual(["event-mixed", "event-pager-retried"]);
    expect(page.total).toBe(2);
  });

  it("does not let another destination's state answer the question", async () => {
    const history = await repositoryWithDestinationFixtures();

    const scoped = await history.listEvents({
      destinationId: "dest-pager",
      destinationOutcome: "succeeded",
    });

    // `event-mixed` reached email successfully, but its Pager send failed.
    expect(eventIds(scoped)).toEqual(["event-pager-retried", "event-to-pager"]);

    // The event-level outcome is the one that cannot tell the two apart, which
    // is why the per-target dimension exists.
    expect(eventIds(await history.listEvents({ deliveryOutcome: "succeeded" }))).toEqual([
      "event-mixed",
      "event-pager-retried",
      "event-to-email",
      "event-to-pager",
    ]);
  });

  it("counts an event once when the target has several deliveries", async () => {
    const history = await repositoryWithDestinationFixtures();

    const page = await history.listEvents({
      destinationId: "dest-pager",
      destinationOutcome: "succeeded",
      limit: 1,
      page: 1,
    });

    // Two Pager rows qualify for `event-pager-retried` plus one for
    // `event-to-pager`; the list shows events, so the page still holds two.
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(2);
  });

  it("reads a missing match with a state as the absence of that state", async () => {
    const history = await repositoryWithDestinationFixtures();

    const page = await history.listEvents({
      destinationId: "dest-pager",
      destinationMatch: "missing",
      destinationOutcome: "failed",
    });

    // A hand-edited URL can pair the two. Both live in the same subquery, so
    // the pair means "no failed delivery to that target" rather than a
    // contradiction or a second, unrelated predicate.
    expect(eventIds(page)).toEqual([
      "event-suppressed-pager",
      "event-to-email",
      "event-to-pager",
      "event-unrouted",
    ]);
    expect(page.total).toBe(4);
  });
});
