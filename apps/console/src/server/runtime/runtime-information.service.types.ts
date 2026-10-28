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

/** Public origins rendered into operator-facing notification links. */
export interface RuntimeInformationLinks {
  /** Origin used for `tocsin.eventUrl`, or null when no base URL is configured. */
  publicBaseUrl: string | null;
}

export interface RuntimeInformationServiceOptions {
  store: Pick<SqliteStore, "sqliteVersion">;
  limits: RuntimeInformationLimits;
  logging: RuntimeInformationLogging;
  links: RuntimeInformationLinks;
  readSystemInformation?: (sqliteVersion: string) => SystemInformation;
}
