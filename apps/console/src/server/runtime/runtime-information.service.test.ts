import { describe, expect, it, vi } from "vite-plus/test";

import { RuntimeInformationService } from "#/server/runtime/runtime-information.service";
import type { RuntimeInformationServiceOptions } from "#/server/runtime/runtime-information.service.types";
import type { SystemInformation } from "#/server/runtime/system-information";

const SYSTEM_INFORMATION: SystemInformation = {
  version: "0.1.0-beta.45",
  nodeVersion: "v26.12.0",
  platform: "linux",
  architecture: "arm64",
  environment: "production",
  sqliteDriver: "better-sqlite3",
  sqliteVersion: "3.53.0",
};

function createService(
  overrides: Partial<RuntimeInformationServiceOptions> = {},
): RuntimeInformationService {
  return new RuntimeInformationService({
    store: { sqliteVersion: async () => "3.53.0" },
    limits: {
      destinationTimeoutMs: 10_000,
      maxWebhookBytes: 1024 * 1024,
      workerBatchSize: 10,
      workerIntervalMs: 5_000,
      workerStaleRunningMs: 5 * 60_000,
    },
    logging: { format: "auto", level: "info" },
    links: { publicBaseUrl: null },
    readSystemInformation: () => SYSTEM_INFORMATION,
    ...overrides,
  });
}

describe("runtime information service", () => {
  it("projects process details and effective limits as a fixed whitelist", async () => {
    const information = await createService().getRuntimeInformation();

    expect(information).toEqual({
      version: "0.1.0-beta.45",
      nodeVersion: "v26.12.0",
      platform: "linux",
      architecture: "arm64",
      environment: "production",
      publicBaseUrl: null,
      sqliteDriver: "better-sqlite3",
      sqliteVersion: "3.53.0",
      destinationTimeoutMs: 10_000,
      maxWebhookBytes: 1024 * 1024,
      workerBatchSize: 10,
      workerIntervalMs: 5_000,
      workerStaleRunningMs: 5 * 60_000,
      logFormat: "auto",
      logLevel: "info",
    });
  });

  it("reads the SQLite version from the live store on every call", async () => {
    const sqliteVersion = vi.fn<() => Promise<string>>(async () => "3.53.0");
    const service = createService({ store: { sqliteVersion } });

    await service.getRuntimeInformation();
    await service.getRuntimeInformation();

    expect(sqliteVersion).toHaveBeenCalledTimes(2);
  });

  it("never forwards unlisted environment values", async () => {
    const service = createService({
      readSystemInformation: () => ({
        ...SYSTEM_INFORMATION,
        // Simulate an upstream object that grew a field the DTO must not expose.
        ...({ databasePath: "/var/lib/tocsin/data.sqlite" } as object),
      }),
    });

    const information = await service.getRuntimeInformation();

    expect(Object.keys(information).sort()).toEqual([
      "architecture",
      "destinationTimeoutMs",
      "environment",
      "logFormat",
      "logLevel",
      "maxWebhookBytes",
      "nodeVersion",
      "platform",
      "publicBaseUrl",
      "sqliteDriver",
      "sqliteVersion",
      "version",
      "workerBatchSize",
      "workerIntervalMs",
      "workerStaleRunningMs",
    ]);
  });

  it("projects the configured notification base URL verbatim", async () => {
    const service = createService({ links: { publicBaseUrl: "https://tocsin.example.test" } });

    const information = await service.getRuntimeInformation();

    expect(information.publicBaseUrl).toBe("https://tocsin.example.test");
  });
});
