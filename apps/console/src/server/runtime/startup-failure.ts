import { SqliteMigrationCompatibilityError, SqliteMigrationError } from "#/infra/sqlite/errors";
import type { ReadyFailureCode, ReadyResponse } from "#/server/runtime/health.types";
import { READY_FAILURE_MESSAGES, checksForFailureCode } from "#/server/runtime/readiness";

export interface StartupFailure {
  code: ReadyFailureCode;
  message: string;
  /** Original error, kept so non-probe requests still fail exactly as before. */
  cause: unknown;
}

/**
 * Classifies a bootstrap storage failure into a stable readiness code.
 *
 * Only the error class is inspected; the message never leaves the server
 * because it can contain database paths and applied migration versions.
 */
export function describeStartupFailure(error: unknown): StartupFailure {
  if (error instanceof SqliteMigrationCompatibilityError) {
    return failure("migration_unknown", error);
  }

  if (error instanceof SqliteMigrationError) {
    return failure("migration_failed", error);
  }

  return failure("store_unavailable", error);
}

export function buildStartupFailureResponse(failure: StartupFailure): {
  status: 503;
  body: ReadyResponse;
} {
  return {
    status: 503,
    body: {
      status: "error",
      checks: checksForFailureCode(failure.code),
      code: failure.code,
      message: failure.message,
    },
  };
}

function failure(code: ReadyFailureCode, cause: unknown): StartupFailure {
  return { code, message: READY_FAILURE_MESSAGES[code], cause };
}
