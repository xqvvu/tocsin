import { describe, expect, it } from "vite-plus/test";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const NOW = "2026-10-12T10:00:00.000Z";

/**
 * Five events that differ only in their provider metadata:
 *
 * - `evt-group` is the first alert of a twenty-alert notification group.
 * - `evt-single` is a group of one alert.
 * - `evt-missing` comes from a provider with no group concept.
 * - `evt-corrupt` carries unparsable metadata; it must not fail the list.
 * - `evt-invalid` reports a count as a string, which is not a usable count.
 */
async function repositoryWithEventMetadata() {
  const db = createSqliteDatabase({ databasePath: ":memory:" });
  await migrateSqliteDatabase(db);

  await db
    .insertInto("sources")
    .values({
      id: "src-1",
      name: "Alertmanager",
      provider: "alertmanager",
      token_hash: "hash",
      created_at: NOW,
      updated_at: NOW,
    })
    .execute();

  const event = (id: string, providerMetadataJson: string) => ({
    id,
    source_id: "src-1",
    fingerprint: `fp-${id}`,
    severity: "critical" as const,
    status: "firing" as const,
    title: "Disk almost full",
    message: "Disk almost full",
    labels_json: "{}",
    normalized_json: "{}",
    provider_metadata_json: providerMetadataJson,
    raw_payload_json: "{}",
    raw_headers_json: "{}",
    received_at: NOW,
    occurred_at: NOW,
    created_at: NOW,
  });

  await db
    .insertInto("events")
    .values([
      event("evt-group", JSON.stringify({ provider: "alertmanager", alertCount: 20 })),
      event("evt-single", JSON.stringify({ provider: "alertmanager", alertCount: 1 })),
      event("evt-missing", JSON.stringify({ provider: "uptime-kuma" })),
      event("evt-corrupt", "{"),
      event("evt-invalid", JSON.stringify({ provider: "grafana", alertCount: "20" })),
    ])
    .execute();

  return createSqliteRepositories(new SqliteRepositoryContext({ db })).history;
}

describe("event list alert-group size projection", () => {
  it("projects the upstream group size and leaves unusable counts empty", async () => {
    const repository = await repositoryWithEventMetadata();

    const page = await repository.listEvents();
    const counts = Object.fromEntries(page.items.map((item) => [item.id, item.alertCount]));

    expect(counts).toEqual({
      "evt-group": 20,
      "evt-single": 1,
      "evt-missing": null,
      "evt-corrupt": null,
      "evt-invalid": null,
    });
  });

  it("keeps the list readable when provider metadata is corrupt", async () => {
    const repository = await repositoryWithEventMetadata();

    const page = await repository.listEvents();

    expect(page.total).toBe(5);
    expect(page.items.find((item) => item.id === "evt-corrupt")?.alertCount).toBeNull();
  });
});
