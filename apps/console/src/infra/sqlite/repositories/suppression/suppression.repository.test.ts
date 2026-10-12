import { describe, expect, it } from "vite-plus/test";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import type { SqliteKysely } from "#/infra/sqlite/schema";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const NOW = "2026-10-12T10:00:00.000Z";
const WINDOW_END = "2026-10-12T12:00:00.000Z";

async function openTestStore() {
  const db = createSqliteDatabase({ databasePath: ":memory:" });
  await migrateSqliteDatabase(db);
  const context = new SqliteRepositoryContext({ db, now: () => NOW });

  return { db, repositories: createSqliteRepositories(context) };
}

async function seedDeliveryTargets(db: SqliteKysely): Promise<void> {
  await db
    .insertInto("sources")
    .values({
      id: "source-1",
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
      id: "destination-1",
      name: "Pager",
      kind: "generic_webhook",
      created_at: NOW,
      updated_at: NOW,
    })
    .execute();
  await db
    .insertInto("events")
    .values({
      id: "event-1",
      source_id: "source-1",
      fingerprint: "fp-1",
      severity: "critical",
      status: "firing",
      title: "Disk full",
      message: "disk full",
      labels_json: "{}",
      normalized_json: JSON.stringify({
        title: "Disk full",
        message: "disk full",
        severity: "critical",
        status: "firing",
        fingerprint: "fp-1",
        labels: {},
        occurredAt: NOW,
      }),
      provider_metadata_json: "{}",
      raw_payload_json: "{}",
      raw_headers_json: "{}",
      received_at: NOW,
      occurred_at: NOW,
      created_at: NOW,
    })
    .execute();
}

describe("sqlite suppression repository", () => {
  it("round-trips a suppression rule, applying matcher and enabled defaults", async () => {
    const { repositories } = await openTestStore();

    const created = await repositories.suppressions.create({
      id: "suppression-1",
      name: "October database migration",
      kind: "maintenance_window",
      reason: "CHG-1234",
      matcher: {
        destinationIds: ["destination-1"],
        labels: [{ key: "env", value: "prod" }],
      },
      endsAt: WINDOW_END,
      createdBy: "user-1",
    });

    expect(created).toEqual({
      id: "suppression-1",
      name: "October database migration",
      kind: "maintenance_window",
      enabled: true,
      reason: "CHG-1234",
      matcher: {
        sourceIds: [],
        destinationIds: ["destination-1"],
        severities: [],
        statuses: [],
        fingerprints: [],
        labels: [{ key: "env", operator: "equals", value: "prod" }],
        titleContains: [],
        messageContains: [],
      },
      startsAt: NOW,
      endsAt: WINDOW_END,
      createdBy: "user-1",
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(await repositories.suppressions.list()).toHaveLength(1);
    expect(await repositories.suppressions.get("suppression-1")).toEqual(created);
  });

  it("updates fields and deletes rules, rejecting unknown ids", async () => {
    let clock = NOW;
    const db = createSqliteDatabase({ databasePath: ":memory:" });
    await migrateSqliteDatabase(db);
    const repositories = createSqliteRepositories(
      new SqliteRepositoryContext({ db, now: () => clock }),
    );

    const created = await repositories.suppressions.create({
      id: "suppression-1",
      name: "Noisy host",
      kind: "silence",
      endsAt: WINDOW_END,
    });

    clock = "2026-10-12T10:30:00.000Z";
    const updated = await repositories.suppressions.update("suppression-1", {
      name: "Noisy host (extended)",
      enabled: false,
      reason: "INC-9",
    });

    expect(updated.name).toBe("Noisy host (extended)");
    expect(updated.enabled).toBe(false);
    expect(updated.reason).toBe("INC-9");
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt).toBe("2026-10-12T10:30:00.000Z");

    await repositories.suppressions.delete("suppression-1");
    expect(await repositories.suppressions.get("suppression-1")).toBeNull();
    await expect(
      repositories.suppressions.update("suppression-1", { name: "gone" }),
    ).rejects.toThrow("Suppression not found");
    await expect(repositories.suppressions.delete("suppression-1")).rejects.toThrow(
      "Suppression not found",
    );

    await db.destroy();
  });

  it("keeps the suppressed delivery audit snapshot after the rule is deleted", async () => {
    const { db, repositories } = await openTestStore();

    // The FK targets `suppressions(id) on delete set null`, so the snapshot has
    // to outlive the rule it points at.
    await seedDeliveryTargets(db);

    const rule = await repositories.suppressions.create({
      id: "suppression-1",
      name: "October database migration",
      kind: "maintenance_window",
      endsAt: WINDOW_END,
    });

    await db
      .insertInto("deliveries")
      .values({
        id: "delivery-1",
        event_id: "event-1",
        destination_id: "destination-1",
        route_id: null,
        state: "suppressed",
        suppression_id: rule.id,
        suppressed_at: NOW,
        suppress_reason: "Maintenance window 「October database migration」 matched label env=prod",
        created_at: NOW,
        updated_at: NOW,
        finished_at: NOW,
      })
      .execute();

    const delivered = await repositories.deliveries.get("delivery-1");

    expect(delivered?.job.state).toBe("suppressed");
    expect(delivered?.job.suppressionId).toBe("suppression-1");
    expect(delivered?.job.suppressedAt).toBe(NOW);
    expect(delivered?.job.suppressReason).toContain("October database migration");

    await repositories.suppressions.delete("suppression-1");

    const audited = await repositories.deliveries.get("delivery-1");

    expect(audited?.job.state).toBe("suppressed");
    expect(audited?.job.suppressionId).toBeNull();
    expect(audited?.job.suppressedAt).toBe(NOW);
    expect(audited?.job.suppressReason).toContain("October database migration");

    await db.destroy();
  });

  it("rejects unknown delivery states at the baseline constraint", async () => {
    const { db } = await openTestStore();
    await seedDeliveryTargets(db);

    await expect(
      db
        .insertInto("deliveries")
        .values({
          id: "delivery-bad",
          event_id: "event-1",
          destination_id: "destination-1",
          route_id: null,
          state: "bogus" as "pending",
          created_at: NOW,
          updated_at: NOW,
        })
        .execute(),
    ).rejects.toThrow(/deliveries_state_check/);

    await db.destroy();
  });
});
