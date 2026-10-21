import type { RuntimeInformation } from "@tocsin/api";

import type { RuntimeInformationServiceOptions } from "#/server/runtime/runtime-information.service.types";
import { loadSystemInformation } from "#/server/runtime/system-information";

/**
 * Read-only runtime projection for the settings screen.
 *
 * The output is assembled field by field from whitelisted values so an
 * environment variable can never leak through as a raw object, and the SQLite
 * version is read from the live store rather than cached at boot.
 */
export class RuntimeInformationService {
  private readonly store: RuntimeInformationServiceOptions["store"];
  private readonly limits: RuntimeInformationServiceOptions["limits"];
  private readonly logging: RuntimeInformationServiceOptions["logging"];
  private readonly readSystemInformation: NonNullable<
    RuntimeInformationServiceOptions["readSystemInformation"]
  >;

  constructor(options: RuntimeInformationServiceOptions) {
    this.store = options.store;
    this.limits = options.limits;
    this.logging = options.logging;
    this.readSystemInformation = options.readSystemInformation ?? loadSystemInformation;
  }

  async getRuntimeInformation(): Promise<RuntimeInformation> {
    const sqliteVersion = await this.store.sqliteVersion();
    const system = this.readSystemInformation(sqliteVersion);

    return {
      version: system.version,
      nodeVersion: system.nodeVersion,
      platform: system.platform,
      architecture: system.architecture,
      environment: system.environment,
      sqliteDriver: system.sqliteDriver,
      sqliteVersion: system.sqliteVersion,
      destinationTimeoutMs: this.limits.destinationTimeoutMs,
      maxWebhookBytes: this.limits.maxWebhookBytes,
      workerBatchSize: this.limits.workerBatchSize,
      workerIntervalMs: this.limits.workerIntervalMs,
      workerStaleRunningMs: this.limits.workerStaleRunningMs,
      logFormat: this.logging.format,
      logLevel: this.logging.level,
    };
  }
}
