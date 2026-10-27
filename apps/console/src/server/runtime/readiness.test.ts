import { describe, expect, it } from "vite-plus/test";

import { evaluateReadiness } from "#/server/runtime/readiness";
import type { ReadinessProbe } from "#/server/runtime/readiness";

function probe(version: string | null): ReadinessProbe {
  return { schemaVersion: async () => version };
}

describe("evaluateReadiness", () => {
  it("reports ready without a failure code when store, migrations, and worker are healthy", async () => {
    const result = await evaluateReadiness({
      openStore: async () => probe("0005"),
      ensureWorker: async () => undefined,
    });

    expect(result).toEqual({
      status: 200,
      body: {
        status: "ok",
        checks: { sqlite: "ok", migrations: "ok", worker: "ok" },
      },
    });
  });

  it("reports store_unavailable when the database cannot be opened", async () => {
    const result = await evaluateReadiness({
      openStore: async () => {
        throw new Error("unable to open database file: /data/tocsin.db");
      },
      ensureWorker: async () => undefined,
    });

    expect(result.status).toBe(503);
    expect(result.body).toMatchObject({
      status: "error",
      code: "store_unavailable",
      checks: { sqlite: "error", migrations: "skipped", worker: "skipped" },
    });
    expect(JSON.stringify(result.body)).not.toContain("/data/tocsin.db");
  });

  it("reports migration_failed when the schema version cannot be read", async () => {
    const result = await evaluateReadiness({
      openStore: async () => ({
        schemaVersion: async () => {
          throw new Error("no such table: schema_migrations");
        },
      }),
      ensureWorker: async () => undefined,
    });

    expect(result.status).toBe(503);
    expect(result.body).toMatchObject({
      status: "error",
      code: "migration_failed",
      checks: { sqlite: "ok", migrations: "error", worker: "skipped" },
    });
  });

  it("reports migration_failed when the schema version is empty", async () => {
    const result = await evaluateReadiness({
      openStore: async () => probe(null),
      ensureWorker: async () => undefined,
    });

    expect(result.status).toBe(503);
    expect(result.body).toMatchObject({
      status: "error",
      code: "migration_failed",
      checks: { sqlite: "ok", migrations: "error", worker: "skipped" },
    });
  });

  it("reports worker_unavailable when the worker runner fails to start", async () => {
    const result = await evaluateReadiness({
      openStore: async () => probe("0005"),
      ensureWorker: async () => {
        throw new Error("worker bootstrap failed");
      },
    });

    expect(result.status).toBe(503);
    expect(result.body).toMatchObject({
      status: "error",
      code: "worker_unavailable",
      checks: { sqlite: "ok", migrations: "ok", worker: "error" },
    });
  });
});
