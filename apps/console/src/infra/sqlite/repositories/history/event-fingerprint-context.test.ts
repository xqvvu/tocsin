import { describe, expect, it } from "vite-plus/test";

import { EventFingerprintContextSchema } from "@tocsin/api/schemas";
import { REDACTED_VALUE } from "@tocsin/core";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const OLDER = "2026-10-12T09:00:00.000Z";
const PREVIOUS = "2026-10-12T09:30:00.000Z";
const CURRENT = "2026-10-12T10:00:00.000Z";

/**
 * The fingerprint context answers "has this fired before, and what changed?"
 * from history alone. These tests pin the three predicates that define it —
 * same source, exact fingerprint, strictly earlier or same-instant — and the
 * redaction of the values it puts back into operator view.
 */
async function contextForCurrentEvent() {
  const db = createSqliteDatabase({ databasePath: ":memory:" });
  await migrateSqliteDatabase(db);

  await db
    .insertInto("sources")
    .values([
      {
        id: "src-1",
        name: "Prometheus",
        provider: "generic",
        token_hash: "hash",
        created_at: CURRENT,
        updated_at: CURRENT,
      },
      {
        id: "src-2",
        name: "Other Prometheus",
        provider: "generic",
        token_hash: "hash-2",
        created_at: CURRENT,
        updated_at: CURRENT,
      },
    ])
    .execute();

  const event = {
    severity: "warning" as const,
    status: "firing" as const,
    normalized_json: "{}",
    provider_metadata_json: "{}",
    raw_payload_json: "{}",
    raw_headers_json: "{}",
    created_at: CURRENT,
  };

  await db
    .insertInto("events")
    .values([
      {
        ...event,
        id: "evt-older",
        source_id: "src-1",
        fingerprint: "checkout:cpu",
        title: "High CPU",
        message: "cpu above 90%",
        labels_json: JSON.stringify({ service: "checkout", region: "cn-east" }),
        received_at: OLDER,
        occurred_at: OLDER,
      },
      {
        ...event,
        id: "evt-previous",
        source_id: "src-1",
        fingerprint: "checkout:cpu",
        title: "High CPU",
        message: "cpu above 95%",
        labels_json: JSON.stringify({ service: "payments", region: "cn-east" }),
        received_at: PREVIOUS,
        occurred_at: PREVIOUS,
      },
      {
        ...event,
        id: "evt-current",
        source_id: "src-1",
        fingerprint: "checkout:cpu",
        title: "High CPU on checkout",
        message: "cpu above 95%",
        labels_json: JSON.stringify({ service: "payments", token: "super-secret" }),
        received_at: CURRENT,
        occurred_at: CURRENT,
      },
      // Different fingerprint: recurrence is defined by the exact string.
      {
        ...event,
        id: "evt-other-fingerprint",
        source_id: "src-1",
        fingerprint: "checkout:memory",
        title: "High memory",
        message: "memory above 90%",
        labels_json: "{}",
        received_at: CURRENT,
        occurred_at: CURRENT,
      },
      // Same fingerprint on another source: fingerprints do not carry across
      // providers, so this must not be counted.
      {
        ...event,
        id: "evt-other-source",
        source_id: "src-2",
        fingerprint: "checkout:cpu",
        title: "High CPU",
        message: "cpu above 99%",
        labels_json: JSON.stringify({ service: "payments" }),
        received_at: CURRENT,
        occurred_at: CURRENT,
      },
    ])
    .execute();

  const repository = createSqliteRepositories(new SqliteRepositoryContext({ db })).history;

  return repository.getEventFingerprintContext("evt-current");
}

describe("event fingerprint context", () => {
  it("counts and lists only earlier occurrences from the same source", async () => {
    const context = await contextForCurrentEvent();

    expect(context).toMatchObject({
      fingerprint: "checkout:cpu",
      earlierCount: 2,
    });
    expect(context?.recent.map((occurrence) => occurrence.id)).toEqual([
      "evt-previous",
      "evt-older",
    ]);
    expect(context?.previous?.id).toBe("evt-previous");
  });

  it("reports field and label changes against the most recent occurrence", async () => {
    const context = await contextForCurrentEvent();

    expect(context?.fieldChanges).toEqual([
      {
        field: "title",
        previous: "High CPU",
        current: "High CPU on checkout",
      },
    ]);
    expect(context?.labelChanges).toEqual([
      // A dropped label and an added one are distinguishable: `null` is
      // absence, never an empty value.
      { key: "region", previous: "cn-east", current: null },
      { key: "token", previous: null, current: REDACTED_VALUE },
    ]);
  });

  it("returns no comparison when the event is the first occurrence", async () => {
    const db = createSqliteDatabase({ databasePath: ":memory:" });
    await migrateSqliteDatabase(db);
    await db
      .insertInto("sources")
      .values({
        id: "src-1",
        name: "Prometheus",
        provider: "generic",
        token_hash: "hash",
        created_at: CURRENT,
        updated_at: CURRENT,
      })
      .execute();
    await db
      .insertInto("events")
      .values({
        id: "evt-only",
        source_id: "src-1",
        fingerprint: "checkout:cpu",
        severity: "warning",
        status: "firing",
        title: "High CPU",
        message: "cpu above 90%",
        labels_json: "{}",
        normalized_json: "{}",
        provider_metadata_json: "{}",
        raw_payload_json: "{}",
        raw_headers_json: "{}",
        received_at: CURRENT,
        occurred_at: CURRENT,
        created_at: CURRENT,
      })
      .execute();

    const repository = createSqliteRepositories(new SqliteRepositoryContext({ db })).history;
    const context = await repository.getEventFingerprintContext("evt-only");

    expect(context).toEqual({
      fingerprint: "checkout:cpu",
      earlierCount: 0,
      previous: null,
      recent: [],
      fieldChanges: [],
      labelChanges: [],
    });
  });

  it("returns null when the event no longer exists", async () => {
    const db = createSqliteDatabase({ databasePath: ":memory:" });
    await migrateSqliteDatabase(db);
    const repository = createSqliteRepositories(new SqliteRepositoryContext({ db })).history;

    await expect(repository.getEventFingerprintContext("missing")).resolves.toBeNull();
  });

  it("stays valid against the contract the console consumes", async () => {
    const context = await contextForCurrentEvent();

    expect(() => EventFingerprintContextSchema.parse(context)).not.toThrow();
  });
});
