import { describe, expect, it } from "vite-plus/test";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const NOW = "2026-10-12T09:00:00.000Z";

/**
 * One rule with four hits over three alerts, two sources, and two
 * destinations, plus two deliveries owned by someone else:
 *
 * - `del-1`, `del-3`, `del-4` → dest-1 (3)
 * - `del-2` → dest-2 (1)
 * - `del-5` is not silenced at all, `del-6` belongs to another rule.
 */
async function repositoryWithSuppressionHits() {
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
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: "src-2",
        name: "Grafana",
        provider: "grafana",
        token_hash: "hash",
        created_at: NOW,
        updated_at: NOW,
      },
    ])
    .execute();

  await db
    .insertInto("suppressions")
    .values([
      {
        id: "sup-1",
        name: "October database migration",
        kind: "maintenance_window",
        matcher_json: "{}",
        starts_at: "2026-10-12T08:00:00.000Z",
        ends_at: "2026-10-12T12:00:00.000Z",
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: "sup-2",
        name: "Other rule",
        kind: "silence",
        matcher_json: "{}",
        starts_at: "2026-10-12T08:00:00.000Z",
        ends_at: "2026-10-12T12:00:00.000Z",
        created_at: NOW,
        updated_at: NOW,
      },
    ])
    .execute();

  await db
    .insertInto("destinations")
    .values([
      {
        id: "dest-1",
        name: "Primary webhook",
        kind: "generic_webhook",
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: "dest-2",
        name: "On-call Feishu",
        kind: "feishu",
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: "dest-3",
        name: "Unused Slack",
        kind: "slack",
        created_at: NOW,
        updated_at: NOW,
      },
    ])
    .execute();

  await db
    .insertInto("events")
    .values([
      {
        id: "evt-1",
        source_id: "src-1",
        fingerprint: "fp-1",
        severity: "critical",
        status: "firing",
        title: "Disk full",
        message: "disk full",
        labels_json: "{}",
        normalized_json: "{}",
        provider_metadata_json: "{}",
        raw_payload_json: "{}",
        raw_headers_json: "{}",
        received_at: "2026-10-12T09:00:00.000Z",
        occurred_at: "2026-10-12T09:00:00.000Z",
        created_at: NOW,
      },
      {
        id: "evt-2",
        source_id: "src-1",
        fingerprint: "fp-2",
        severity: "warning",
        status: "firing",
        title: "High latency",
        message: "latency above threshold",
        labels_json: "{}",
        normalized_json: "{}",
        provider_metadata_json: "{}",
        raw_payload_json: "{}",
        raw_headers_json: "{}",
        received_at: "2026-10-12T09:10:00.000Z",
        occurred_at: "2026-10-12T09:10:00.000Z",
        created_at: NOW,
      },
      {
        id: "evt-3",
        source_id: "src-2",
        fingerprint: "fp-3",
        severity: "critical",
        status: "resolved",
        title: "Replica down",
        message: "replica is down",
        labels_json: "{}",
        normalized_json: "{}",
        provider_metadata_json: "{}",
        raw_payload_json: "{}",
        raw_headers_json: "{}",
        received_at: "2026-10-12T09:20:00.000Z",
        occurred_at: "2026-10-12T09:20:00.000Z",
        created_at: NOW,
      },
    ])
    .execute();

  await db
    .insertInto("deliveries")
    .values(
      [
        {
          id: "del-1",
          event_id: "evt-1",
          destination_id: "dest-1",
          suppression_id: "sup-1",
          created_at: "2026-10-12T09:00:00.000Z",
        },
        {
          id: "del-2",
          event_id: "evt-1",
          destination_id: "dest-2",
          suppression_id: "sup-1",
          created_at: "2026-10-12T09:05:00.000Z",
        },
        {
          id: "del-3",
          event_id: "evt-2",
          destination_id: "dest-1",
          suppression_id: "sup-1",
          created_at: "2026-10-12T09:10:00.000Z",
        },
        {
          id: "del-4",
          event_id: "evt-3",
          destination_id: "dest-1",
          suppression_id: "sup-1",
          created_at: "2026-10-12T09:20:00.000Z",
        },
        {
          id: "del-5",
          event_id: "evt-3",
          destination_id: "dest-3",
          suppression_id: null,
          created_at: "2026-10-12T09:30:00.000Z",
        },
        {
          id: "del-6",
          event_id: "evt-3",
          destination_id: "dest-3",
          suppression_id: "sup-2",
          created_at: "2026-10-12T09:40:00.000Z",
        },
      ].map((delivery) => ({
        ...delivery,
        state: "suppressed" as const,
        attempt_count: 0,
        updated_at: delivery.created_at,
        finished_at: delivery.created_at,
      })),
    )
    .execute();

  return createSqliteRepositories(new SqliteRepositoryContext({ db })).history;
}

describe("suppression delivery impact", () => {
  it("aggregates the silenced volume over distinct alerts, sources, and destinations", async () => {
    const repository = await repositoryWithSuppressionHits();

    const impact = await repository.suppressionDeliveryImpact({ suppressionId: "sup-1" });

    expect(impact).toMatchObject({
      deliveryCount: 4,
      eventCount: 3,
      sourceCount: 2,
      destinationCount: 2,
      firstHitAt: "2026-10-12T09:00:00.000Z",
      lastHitAt: "2026-10-12T09:20:00.000Z",
    });
    // Canonical severity order, not count order: the panel should read like
    // every other severity control even before the first hit arrives.
    expect(impact.severities).toEqual([
      { severity: "critical", deliveryCount: 3 },
      { severity: "warning", deliveryCount: 1 },
    ]);
    expect(impact.destinations).toEqual([
      {
        destinationId: "dest-1",
        destinationName: "Primary webhook",
        kind: "generic_webhook",
        deliveryCount: 3,
      },
      {
        destinationId: "dest-2",
        destinationName: "On-call Feishu",
        kind: "feishu",
        deliveryCount: 1,
      },
    ]);
  });

  it("caps the destination breakdown but still counts every destination", async () => {
    const repository = await repositoryWithSuppressionHits();

    const impact = await repository.suppressionDeliveryImpact({
      suppressionId: "sup-1",
      destinationLimit: 1,
    });

    expect(impact.destinationCount).toBe(2);
    expect(impact.destinations).toHaveLength(1);
    expect(impact.destinations[0]?.destinationId).toBe("dest-1");
  });

  it("reports an empty window as zeros rather than nulls leaking into the UI", async () => {
    const repository = await repositoryWithSuppressionHits();

    const impact = await repository.suppressionDeliveryImpact({ suppressionId: "sup-empty" });

    expect(impact).toEqual({
      deliveryCount: 0,
      eventCount: 0,
      sourceCount: 0,
      destinationCount: 0,
      firstHitAt: null,
      lastHitAt: null,
      severities: [],
      destinations: [],
    });
  });
});
