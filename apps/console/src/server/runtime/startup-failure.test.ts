import { describe, expect, it } from "vite-plus/test";

import {
  SqliteError,
  SqliteMigrationCompatibilityError,
  SqliteMigrationError,
} from "#/infra/sqlite/errors";
import {
  buildStartupFailureResponse,
  describeStartupFailure,
} from "#/server/runtime/startup-failure";

describe("describeStartupFailure", () => {
  it("classifies unknown applied migrations as migration_unknown", () => {
    const failure = describeStartupFailure(
      new SqliteMigrationCompatibilityError(
        "SQLite database has applied migrations not present in this build: 9999",
      ),
    );

    expect(failure.code).toBe("migration_unknown");
    expect(failure.message).toBe("Database contains migrations this build does not recognize");
  });

  it("classifies other migration errors as migration_failed", () => {
    const failure = describeStartupFailure(
      new SqliteMigrationError("Failed to apply SQLite migration 0006_example"),
    );

    expect(failure.code).toBe("migration_failed");
    expect(failure.message).toBe("Database migration failed");
  });

  it("classifies database errors as store_unavailable", () => {
    expect(describeStartupFailure(new SqliteError("unable to open database file")).code).toBe(
      "store_unavailable",
    );
    expect(describeStartupFailure(new Error("EACCES: permission denied")).code).toBe(
      "store_unavailable",
    );
  });

  it("keeps the original error available for non-probe requests", () => {
    const cause = new SqliteMigrationError("boom");

    expect(describeStartupFailure(cause).cause).toBe(cause);
  });
});

describe("buildStartupFailureResponse", () => {
  it("returns 503 with a stable code and no raw error detail", () => {
    const response = buildStartupFailureResponse(
      describeStartupFailure(
        new SqliteMigrationCompatibilityError(
          "SQLite database has applied migrations not present in this build: 9999",
        ),
      ),
    );
    const serialized = JSON.stringify(response.body);

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      status: "error",
      code: "migration_unknown",
      message: "Database contains migrations this build does not recognize",
      checks: { sqlite: "ok", migrations: "error", worker: "skipped" },
    });
    expect(serialized).not.toContain("9999");
    expect(serialized).not.toContain("applied migrations not present");
  });
});
