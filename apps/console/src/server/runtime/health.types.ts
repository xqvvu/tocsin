export type HealthCheckStatus = "ok" | "error" | "skipped";

export interface HealthResponse {
  status: "ok";
}

/**
 * Stable reason codes for an unready server. Probes and runbooks branch on
 * these instead of parsing log lines or human-readable messages.
 */
export type ReadyFailureCode =
  | "migration_unknown"
  | "migration_failed"
  | "store_unavailable"
  | "worker_unavailable";

export interface ReadyResponse {
  status: "ok" | "error";
  checks: {
    sqlite: HealthCheckStatus;
    migrations: HealthCheckStatus;
    worker: HealthCheckStatus;
  };
  /** Present only when `status` is `"error"`. */
  code?: ReadyFailureCode;
  /** Safe operator-facing summary: no paths, SQL, or secrets. */
  message?: string;
}
