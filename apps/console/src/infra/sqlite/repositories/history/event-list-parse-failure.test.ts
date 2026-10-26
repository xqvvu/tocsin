import { describe, expect, it } from "vite-plus/test";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const NOW = "2026-10-12T10:00:00.000Z";

/**
 * Three events that differ only in their provider metadata:
 *
 * - `evt-parse-failure` is intake's audit row for a rejected payload.
 * - `evt-normal` was parsed successfully.
 * - `evt-corrupt` carries unparsable metadata; it must not fail the list.
 */
async function repositoryWithEventMetadata() {
  const db = createSqliteDatabase({ databasePath: ":memory:" });
  await migrateSqliteDatabase(db);

  await db
    .insertInto("sources")
    .values({
      id: "src-1",
      name: "Grafana",
      provider: "grafana",
      token_hash: "hash",
      created_at: NOW,
      updated_at: NOW,
    })
    .execute();

  const event = (id: string, providerMetadataJson: string) => ({
    id,
    source_id: "src-1",
    fingerprint: `fp-${id}`,
    severity: "unknown" as const,
    status: "unknown" as const,
    title: "Provider parser rejected webhook payload",
    message: "Webhook payload was stored for inspection",
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
      event(
        "evt-parse-failure",
        JSON.stringify({
          provider: "grafana",
          parseFailed: true,
          reason: "invalid_payload",
          errorMessage: "alert list is empty",
        }),
      ),
      event("evt-normal", JSON.stringify({ provider: "grafana" })),
      event("evt-corrupt", "{"),
    ])
    .execute();

  return createSqliteRepositories(new SqliteRepositoryContext({ db })).history;
}

describe("event list parse-failure projection", () => {
  it("marks only the parser-rejected event", async () => {
    const repository = await repositoryWithEventMetadata();

    const page = await repository.listEvents();
    const flags = Object.fromEntries(page.items.map((item) => [item.id, item.parseFailed]));

    expect(flags).toEqual({
      "evt-parse-failure": true,
      "evt-normal": false,
      "evt-corrupt": false,
    });
  });

  it("keeps the list readable when provider metadata is corrupt", async () => {
    const repository = await repositoryWithEventMetadata();

    const page = await repository.listEvents();

    expect(page.total).toBe(3);
    expect(page.items.find((item) => item.id === "evt-corrupt")?.parseFailed).toBe(false);
  });
});
