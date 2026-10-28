import { describe, expect, it } from "vite-plus/test";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const NOW = "2026-10-12T10:00:00.000Z";

async function repositoryWithSearchFixtures(): Promise<
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
        id: "dest-1",
        name: "Pager",
        kind: "generic_webhook" as const,
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: "dest-2",
        name: "Feishu OnCall",
        kind: "generic_webhook" as const,
        created_at: NOW,
        updated_at: NOW,
      },
    ])
    .execute();

  await db
    .insertInto("routes")
    .values({
      id: "route-1",
      name: "Critical path",
      rule_json: "{}",
      destination_ids_json: '["dest-1"]',
      created_at: NOW,
      updated_at: NOW,
    })
    .execute();

  const event = (
    id: string,
    fingerprint: string,
    title: string,
    message: string,
    overrides: Partial<{
      idempotency_key: string;
      labels_json: string;
      provider_metadata_json: string;
      raw_payload_json: string;
    }> = {},
  ) => ({
    id,
    source_id: "src-1",
    fingerprint,
    severity: "critical" as const,
    status: "firing" as const,
    title,
    message,
    labels_json: "{}",
    normalized_json: "{}",
    provider_metadata_json: "{}",
    raw_payload_json: "{}",
    raw_headers_json: "{}",
    received_at: NOW,
    occurred_at: NOW,
    created_at: NOW,
    ...overrides,
  });

  await db
    .insertInto("events")
    .values([
      event("event-fingerprint", "fp-cpu-high", "Disk full", "root volume"),
      event("event-underscore", "fp-underscore", "cpu_high", "usage"),
      event("event-hyphen", "fp-hyphen", "cpu-high", "usage"),
      event("event-percent", "fp-percent", "100% packet loss", "loss"),
      // `\` is the LIKE escape character itself. Left unescaped, the query
      // term `C:\temp` would mean `C:temp` and hit the decoy row as well.
      event("event-backslash", "fp-backslash", "C:\\temp full", "path"),
      event("event-backslash-decoy", "fp-backslash-decoy", "C:temp full", "path"),
      event("event-message", "fp-message", "Memory", "oom"),
      // Opaque ids that are not substrings of each other, so an identifier
      // lookup can only hit through the intended branch.
      event("evt-opaque-7f3a", "fp-opaque", "Node down", "node"),
      event("event-feishu", "fp-feishu", "Edge latency", "latency"),
      // Retried until it succeeded, so `last_error` is cleared and only the
      // attempt history still carries the failure on-call searched for.
      event("event-retried", "fp-retried", "Flaky target", "quux11"),
      event("event-labels", "fp-labels", "Latency", "p99", {
        labels_json: '{"service":"checkout","env":"prod"}',
      }),
      event("event-upstream", "fp-upstream", "Fire", "burn", {
        provider_metadata_json: '{"provider":"grafana","receiver":"platform-burn"}',
      }),
      // The idempotency key is shown with a copy action on event detail, so a
      // pasted value must find the event and the deliveries it produced.
      event("event-idempotency", "fp-idem", "Idem probe one", "quux7", {
        idempotency_key: "req-2f9c-77ab",
      }),
      // `_` in an idempotency key is a literal character, not a wildcard.
      // The hyphen variant is a decoy: an unescaped `_` would match both.
      event("event-idempotency-underscore", "fp-idem-underscore", "Idem probe two", "quux8", {
        idempotency_key: "req_100_done",
      }),
      event("event-idempotency-hyphen", "fp-idem-hyphen", "Idem probe three", "quux9", {
        idempotency_key: "req-100-done",
      }),
      // A credential pasted into the raw payload is not searchable; only the
      // redacted projection is ever shown, so matching it would be an oracle.
      event("event-raw-secret", "fp-raw-secret", "Quiet", "nothing", {
        raw_payload_json: '{"password":"raw-secret-should-not-match"}',
      }),
      // Labels are stored raw (route matching needs the original value) and
      // redacted only when projected. Search follows the title/message rule.
      event("event-secret-label", "fp-secret-label", "Auth", "denied", {
        labels_json: '{"authorization":"Bearer sekret"}',
      }),
    ])
    .execute();

  await db
    .insertInto("deliveries")
    .values([
      ...[
        "event-fingerprint",
        "event-underscore",
        "event-hyphen",
        "event-percent",
        "event-backslash",
        "event-backslash-decoy",
        "event-message",
        "event-idempotency",
        "event-idempotency-underscore",
        "event-idempotency-hyphen",
      ].map((eventId) => ({
        id: `delivery-${eventId}`,
        event_id: eventId,
        destination_id: "dest-1",
        route_id: eventId === "event-fingerprint" ? "route-1" : null,
        state: "pending" as const,
        last_error: eventId === "event-message" ? "connection refused" : null,
        created_at: NOW,
        updated_at: NOW,
      })),
      {
        id: "dlv-opaque-91c2",
        event_id: "evt-opaque-7f3a",
        destination_id: "dest-1",
        state: "pending" as const,
        created_at: NOW,
        updated_at: NOW,
      },
      {
        // Manual delivery (no route) to another destination.
        id: "dlv-manual-feishu",
        event_id: "event-feishu",
        destination_id: "dest-2",
        state: "failed" as const,
        last_error: "signature mismatch",
        created_at: NOW,
        updated_at: NOW,
      },
      {
        // Succeeded on the second attempt: `last_error` is null, and the
        // first attempt's error lives only in `delivery_attempts`.
        id: "dlv-retried-success",
        event_id: "event-retried",
        destination_id: "dest-1",
        state: "succeeded" as const,
        last_error: null,
        created_at: NOW,
        updated_at: NOW,
      },
      {
        // Delivered through Feishu, so the provider returned a message id.
        id: "dlv-provider-ref",
        event_id: "event-feishu",
        destination_id: "dest-1",
        state: "succeeded" as const,
        provider_ref_type: "feishu_message_id",
        provider_ref_value: "om_ref_5d2f",
        created_at: NOW,
        updated_at: NOW,
      },
      {
        // Half of a legacy reference: not enough to find the message, so the
        // receipt filter must count it as missing.
        id: "dlv-provider-ref-partial",
        event_id: "event-feishu",
        destination_id: "dest-1",
        state: "succeeded" as const,
        provider_ref_type: "feishu_message_id",
        created_at: NOW,
        updated_at: NOW,
      },
      ...[
        ["event-labels", "dlv-event-labels"],
        ["event-upstream", "dlv-event-upstream"],
        ["event-raw-secret", "dlv-event-raw-secret"],
      ].map(([eventId, deliveryId]) => ({
        id: deliveryId,
        event_id: eventId,
        destination_id: "dest-1",
        state: "pending" as const,
        created_at: NOW,
        updated_at: NOW,
      })),
    ])
    .execute();

  await db
    .insertInto("delivery_attempts")
    .values([
      {
        id: "attempt-retried-1",
        delivery_id: "dlv-retried-success",
        attempt_number: 1,
        state: "failed",
        response_status: 503,
        error: "attempt-only handshake timeout",
        started_at: NOW,
        finished_at: NOW,
      },
      {
        id: "attempt-retried-2",
        delivery_id: "dlv-retried-success",
        attempt_number: 2,
        state: "succeeded",
        response_status: 200,
        started_at: NOW,
        finished_at: NOW,
      },
    ])
    .execute();

  return createSqliteRepositories(new SqliteRepositoryContext({ db })).history;
}

function ids(items: Array<{ id: string }>): string[] {
  return items.map((item) => item.id).sort();
}

describe("history search", () => {
  it("matches the event fingerprint promised by the search placeholder", async () => {
    const repository = await repositoryWithSearchFixtures();

    const page = await repository.listEvents({ q: "fp-cpu" });

    expect(ids(page.items)).toEqual(["event-fingerprint"]);
    expect(page.total).toBe(1);
  });

  it("matches the fingerprint from the deliveries list too", async () => {
    const repository = await repositoryWithSearchFixtures();

    const page = await repository.listDeliveries({ q: "fp-cpu" });

    expect(ids(page.items)).toEqual(["delivery-event-fingerprint"]);
    expect(page.total).toBe(1);
  });

  it("matches a pasted event id on both lists", async () => {
    const repository = await repositoryWithSearchFixtures();

    const events = await repository.listEvents({ q: "evt-opaque-7f3a" });
    const deliveries = await repository.listDeliveries({ q: "evt-opaque-7f3a" });

    expect(ids(events.items)).toEqual(["evt-opaque-7f3a"]);
    expect(events.total).toBe(1);
    // The event id narrows deliveries to the ones it produced.
    expect(ids(deliveries.items)).toEqual(["dlv-opaque-91c2"]);
    expect(deliveries.total).toBe(1);
  });

  it("matches a pasted delivery id on both lists", async () => {
    const repository = await repositoryWithSearchFixtures();

    const events = await repository.listEvents({ q: "dlv-opaque-91c2" });
    const deliveries = await repository.listDeliveries({ q: "dlv-opaque-91c2" });

    expect(ids(events.items)).toEqual(["evt-opaque-7f3a"]);
    expect(events.total).toBe(1);
    expect(ids(deliveries.items)).toEqual(["dlv-opaque-91c2"]);
    expect(deliveries.total).toBe(1);
  });

  it("matches a pasted idempotency key on both lists", async () => {
    const repository = await repositoryWithSearchFixtures();

    const events = await repository.listEvents({ q: "req-2f9c-77ab" });
    const deliveries = await repository.listDeliveries({ q: "req-2f9c-77ab" });

    expect(ids(events.items)).toEqual(["event-idempotency"]);
    expect(events.total).toBe(1);
    // The key belongs to the event, so it narrows deliveries to what it
    // produced, the same way a pasted event id does.
    expect(ids(deliveries.items)).toEqual(["delivery-event-idempotency"]);
    expect(deliveries.total).toBe(1);
  });

  it("treats _ in an idempotency key as a literal character", async () => {
    const repository = await repositoryWithSearchFixtures();

    const events = await repository.listEvents({ q: "req_100_done" });
    const deliveries = await repository.listDeliveries({ q: "req_100_done" });

    // The hyphen variant differs only at the escaped character.
    expect(ids(events.items)).toEqual(["event-idempotency-underscore"]);
    expect(events.total).toBe(1);
    expect(ids(deliveries.items)).toEqual(["delivery-event-idempotency-underscore"]);
    expect(deliveries.total).toBe(1);
  });

  it("keeps title and message matches working", async () => {
    const repository = await repositoryWithSearchFixtures();

    const events = await repository.listEvents({ q: "disk" });
    const deliveries = await repository.listDeliveries({ q: "oom" });

    expect(ids(events.items)).toEqual(["event-fingerprint"]);
    expect(ids(deliveries.items)).toEqual(["delivery-event-message"]);
  });

  it("matches the latest error shown in the deliveries table", async () => {
    const repository = await repositoryWithSearchFixtures();

    const page = await repository.listDeliveries({ q: "connection refused" });

    expect(ids(page.items)).toEqual(["delivery-event-message"]);
    expect(page.total).toBe(1);
  });

  it("matches an error that only the attempt history keeps", async () => {
    const repository = await repositoryWithSearchFixtures();

    const page = await repository.listDeliveries({ q: "handshake timeout" });

    expect(ids(page.items)).toEqual(["dlv-retried-success"]);
    expect(page.total).toBe(1);
    // The delivery succeeded, so the latest-error column is already cleared:
    // the hit can only come from the failed attempt.
    expect(page.items[0]?.lastError).toBeNull();
  });

  it("matches the destination name shown in the deliveries table", async () => {
    const repository = await repositoryWithSearchFixtures();

    const page = await repository.listDeliveries({ q: "OnCall" });

    expect(ids(page.items)).toEqual(["dlv-manual-feishu"]);
    expect(page.total).toBe(1);
  });

  it("matches the route name and leaves manual deliveries alone", async () => {
    const repository = await repositoryWithSearchFixtures();

    const page = await repository.listDeliveries({ q: "Critical path" });

    // Manual deliveries have no route, so the correlated route subquery
    // cannot match them.
    expect(ids(page.items)).toEqual(["delivery-event-fingerprint"]);
    expect(page.total).toBe(1);
  });

  it("matches the external message reference on both lists", async () => {
    const repository = await repositoryWithSearchFixtures();

    const deliveries = await repository.listDeliveries({ q: "om_ref_5d2f" });
    const events = await repository.listEvents({ q: "om_ref_5d2f" });

    expect(ids(deliveries.items)).toEqual(["dlv-provider-ref"]);
    expect(deliveries.total).toBe(1);
    // The reference belongs to the delivery, so the event is reached through
    // its deliveries: a message id pasted from chat still leads back to the
    // alert that produced it.
    expect(ids(events.items)).toEqual(["event-feishu"]);
    expect(events.total).toBe(1);
  });

  it("does not search the machine-readable reference type on the events list", async () => {
    const repository = await repositoryWithSearchFixtures();

    // `provider_ref_type` is a machine value (`feishu_message_id`), not the
    // handle on-call receives; only the reference value participates in search.
    const page = await repository.listEvents({ q: "feishu_message_id" });

    expect(page.total).toBe(0);
  });

  it("treats % as a literal character instead of a wildcard", async () => {
    const repository = await repositoryWithSearchFixtures();

    const events = await repository.listEvents({ q: "%" });
    const deliveries = await repository.listDeliveries({ q: "%" });

    expect(ids(events.items)).toEqual(["event-percent"]);
    expect(events.total).toBe(1);
    expect(ids(deliveries.items)).toEqual(["delivery-event-percent"]);
    expect(deliveries.total).toBe(1);
  });

  it("treats _ as a literal character instead of a single-character wildcard", async () => {
    const repository = await repositoryWithSearchFixtures();

    const events = await repository.listEvents({ q: "cpu_high" });

    expect(ids(events.items)).toEqual(["event-underscore"]);
    expect(events.total).toBe(1);
  });

  it("treats a backslash as a literal character instead of an escape prefix", async () => {
    const repository = await repositoryWithSearchFixtures();

    // `C:\temp` and `C:temp` are different paths. Because the predicates use
    // `ESCAPE '\'`, a term that skips backslash escaping would collapse the
    // first into the second and return both rows.
    const events = await repository.listEvents({ q: "C:\\temp" });
    const deliveries = await repository.listDeliveries({ q: "C:\\temp" });

    expect(ids(events.items)).toEqual(["event-backslash"]);
    expect(events.total).toBe(1);
    expect(ids(deliveries.items)).toEqual(["delivery-event-backslash"]);
    expect(deliveries.total).toBe(1);

    const decoy = await repository.listEvents({ q: "C:temp" });

    expect(ids(decoy.items)).toEqual(["event-backslash-decoy"]);
    expect(decoy.total).toBe(1);
  });

  it("matches a label value on both lists", async () => {
    const repository = await repositoryWithSearchFixtures();

    const events = await repository.listEvents({ q: "checkout" });
    const deliveries = await repository.listDeliveries({ q: "checkout" });

    expect(ids(events.items)).toEqual(["event-labels"]);
    expect(events.total).toBe(1);
    expect(ids(deliveries.items)).toEqual(["dlv-event-labels"]);
    expect(deliveries.total).toBe(1);
  });

  it("matches a label key", async () => {
    const repository = await repositoryWithSearchFixtures();

    const events = await repository.listEvents({ q: "env" });

    expect(ids(events.items)).toEqual(["event-labels"]);
    expect(events.total).toBe(1);
  });

  it("matches upstream provider metadata on both lists", async () => {
    const repository = await repositoryWithSearchFixtures();

    const events = await repository.listEvents({ q: "platform-burn" });
    const deliveries = await repository.listDeliveries({ q: "platform-burn" });

    expect(ids(events.items)).toEqual(["event-upstream"]);
    expect(events.total).toBe(1);
    expect(ids(deliveries.items)).toEqual(["dlv-event-upstream"]);
    expect(deliveries.total).toBe(1);
  });

  it("does not search raw payloads for credential-shaped values", async () => {
    const repository = await repositoryWithSearchFixtures();

    const events = await repository.listEvents({ q: "raw-secret-should-not-match" });
    const deliveries = await repository.listDeliveries({ q: "raw-secret-should-not-match" });

    expect(events.total).toBe(0);
    expect(deliveries.total).toBe(0);
  });

  it("still redacts a sensitive label value in the detail projection", async () => {
    const repository = await repositoryWithSearchFixtures();

    const page = await repository.listEvents({ q: "sekret" });
    const detail = await repository.getEventDetail("event-secret-label");

    // Matching uses the stored value, like title and message do, but a hit only
    // reveals that the row exists.
    expect(ids(page.items)).toEqual(["event-secret-label"]);
    expect(page.total).toBe(1);
    expect(detail?.event.normalized.labels.authorization).toBe("[REDACTED]");
  });

  it("requires every whitespace-separated term to match the same event", async () => {
    const repository = await repositoryWithSearchFixtures();

    const both = await repository.listEvents({ q: "disk root" });
    // "oom" matches another event, so a phrase-only match would return it too.
    const acrossRows = await repository.listEvents({ q: "disk oom" });

    expect(ids(both.items)).toEqual(["event-fingerprint"]);
    expect(both.total).toBe(1);
    expect(acrossRows.total).toBe(0);
  });

  it("matches terms across different searchable fields in either order", async () => {
    const repository = await repositoryWithSearchFixtures();

    const titleThenLabel = await repository.listEvents({ q: "latency prod" });
    const labelThenTitle = await repository.listEvents({ q: "prod latency" });

    expect(ids(titleThenLabel.items)).toEqual(["event-labels"]);
    expect(titleThenLabel.total).toBe(1);
    expect(ids(labelThenTitle.items)).toEqual(["event-labels"]);
    expect(labelThenTitle.total).toBe(1);
  });

  it("escapes wildcards per term", async () => {
    const repository = await repositoryWithSearchFixtures();

    const literal = await repository.listEvents({ q: "100% loss" });
    const noMatch = await repository.listEvents({ q: "100% oom" });

    expect(ids(literal.items)).toEqual(["event-percent"]);
    expect(literal.total).toBe(1);
    expect(noMatch.total).toBe(0);
  });

  it("ANDs terms on the deliveries list too", async () => {
    const repository = await repositoryWithSearchFixtures();

    const page = await repository.listDeliveries({ q: "signature feishu" });

    // "signature" comes from last_error, "feishu" from the destination name.
    expect(ids(page.items)).toEqual(["dlv-manual-feishu"]);
    expect(page.total).toBe(1);
  });

  it("caps the term list so a pasted line cannot expand the query without bound", async () => {
    const repository = await repositoryWithSearchFixtures();

    // The ninth term would match nothing; only the first eight are searched.
    const page = await repository.listEvents({
      q: "disk disk disk disk disk disk disk disk zzz",
    });

    expect(ids(page.items)).toEqual(["event-fingerprint"]);
    expect(page.total).toBe(1);
  });

  it("treats a whitespace-only query as no filter", async () => {
    const repository = await repositoryWithSearchFixtures();

    const allEvents = await repository.listEvents();
    const blankEvents = await repository.listEvents({ q: "   " });

    expect(ids(blankEvents.items)).toEqual(ids(allEvents.items));
    expect(blankEvents.total).toBe(allEvents.total);

    // The delivery predicate has its own empty-term branch; both lists must
    // ignore a blank term rather than fall back to `%` or match nothing.
    const allDeliveries = await repository.listDeliveries();
    const blankDeliveries = await repository.listDeliveries({ q: "   " });

    expect(ids(blankDeliveries.items)).toEqual(ids(allDeliveries.items));
    expect(blankDeliveries.total).toBe(allDeliveries.total);
  });
});

describe("delivery receipt filter", () => {
  it("keeps only deliveries with a complete external message reference", async () => {
    const repository = await repositoryWithSearchFixtures();

    const page = await repository.listDeliveries({ receipt: "present" });

    expect(ids(page.items)).toEqual(["dlv-provider-ref"]);
    expect(page.total).toBe(1);
    // The list carries the same handle the detail page exposes, so the row can
    // prove delivery without a second request.
    expect(page.items[0]?.providerReference).toEqual({
      type: "feishu_message_id",
      value: "om_ref_5d2f",
    });
  });

  it("treats a half-written reference as missing", async () => {
    const repository = await repositoryWithSearchFixtures();

    const all = await repository.listDeliveries({ limit: 100 });
    const missing = await repository.listDeliveries({ receipt: "missing", limit: 100 });

    expect(ids(missing.items)).toContain("dlv-provider-ref-partial");
    expect(ids(missing.items)).not.toContain("dlv-provider-ref");
    // Page and total share the predicate: exactly the one complete reference
    // is excluded from the missing bucket.
    expect(missing.total).toBe(all.total - 1);
  });
});
