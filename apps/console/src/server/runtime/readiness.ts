import type { ReadyFailureCode, ReadyResponse } from "#/server/runtime/health.types";

/**
 * Fixed summaries for readiness failures. They deliberately omit the raw error
 * text: migration errors quote paths and schema versions, and the endpoint is
 * reachable without authentication.
 */
export const READY_FAILURE_MESSAGES = {
  migration_unknown: "Database contains migrations this build does not recognize",
  migration_failed: "Database migration failed",
  store_unavailable: "SQLite database is unavailable",
  worker_unavailable: "Background worker failed to start",
} as const satisfies Record<ReadyFailureCode, string>;

type ReadinessChecks = ReadyResponse["checks"];

export function checksForFailureCode(code: ReadyFailureCode): ReadinessChecks {
  switch (code) {
    case "migration_unknown":
    case "migration_failed":
      return { sqlite: "ok", migrations: "error", worker: "skipped" };
    case "store_unavailable":
      return { sqlite: "error", migrations: "skipped", worker: "skipped" };
    case "worker_unavailable":
      return { sqlite: "ok", migrations: "ok", worker: "error" };
  }
}

export interface ReadinessProbe {
  schemaVersion(): Promise<string | null>;
}

export interface ReadinessInput {
  openStore(): Promise<ReadinessProbe>;
  ensureWorker(): Promise<unknown>;
}

export interface ReadinessResult {
  status: 200 | 503;
  body: ReadyResponse;
}

export async function evaluateReadiness(input: ReadinessInput): Promise<ReadinessResult> {
  const checks: ReadinessChecks = {
    sqlite: "skipped",
    migrations: "skipped",
    worker: "skipped",
  };

  try {
    const store = await input.openStore();
    checks.sqlite = "ok";

    const version = await store.schemaVersion();
    checks.migrations = version ? "ok" : "error";

    if (checks.migrations === "ok") {
      await input.ensureWorker();
      checks.worker = "ok";
    }
  } catch {
    if (checks.sqlite === "skipped") {
      checks.sqlite = "error";
    } else if (checks.migrations === "skipped") {
      checks.migrations = "error";
    } else if (checks.worker === "skipped") {
      checks.worker = "error";
    }
  }

  const ready = Object.values(checks).every((value) => value === "ok");

  if (ready) {
    return { status: 200, body: { status: "ok", checks } };
  }

  const code = failureCodeForChecks(checks);

  return {
    status: 503,
    body: {
      status: "error",
      checks,
      code,
      message: READY_FAILURE_MESSAGES[code],
    },
  };
}

function failureCodeForChecks(checks: ReadinessChecks): ReadyFailureCode {
  if (checks.sqlite === "error") {
    return "store_unavailable";
  }

  if (checks.migrations === "error") {
    return "migration_failed";
  }

  return "worker_unavailable";
}
