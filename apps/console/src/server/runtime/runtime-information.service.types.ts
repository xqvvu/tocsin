import type { RuntimeInformation } from "@tocsin/api";

import type { SqliteStore } from "#/infra/sqlite/store";
import type { SystemInformation } from "#/server/runtime/system-information";

/** Effective outbound and worker limits resolved from the environment. */
export interface RuntimeInformationLimits {
  destinationTimeoutMs: number;
  maxWebhookBytes: number;
  workerBatchSize: number;
  workerIntervalMs: number;
  workerStaleRunningMs: number;
}

export interface RuntimeInformationLogging {
  format: RuntimeInformation["logFormat"];
  level: RuntimeInformation["logLevel"];
}

export interface RuntimeInformationServiceOptions {
  store: Pick<SqliteStore, "sqliteVersion">;
  limits: RuntimeInformationLimits;
  logging: RuntimeInformationLogging;
  readSystemInformation?: (sqliteVersion: string) => SystemInformation;
}
