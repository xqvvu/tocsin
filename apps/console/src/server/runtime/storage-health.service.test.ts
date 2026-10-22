import { describe, expect, it } from "vite-plus/test";

import type { StorageHealthSnapshot } from "#/infra/sqlite/storage-health";
import { StorageHealthService } from "#/server/runtime/storage-health.service";

const SNAPSHOT: StorageHealthSnapshot = {
  pageCount: 64,
  pageSizeBytes: 4096,
  freePageCount: 8,
  tableCounts: {
    events: 120,
    deliveries: 340,
    deliveryAttempts: 512,
    oncallPings: 7,
  },
  oldestEventAt: "2026-06-01T00:00:00.000Z",
  newestEventAt: "2026-06-07T00:00:00.000Z",
};

describe("storage health service", () => {
  it("projects the SQLite snapshot into byte totals and row counts", async () => {
    const service = new StorageHealthService({
      store: { storageHealth: async () => SNAPSHOT },
    });

    await expect(service.getStorageHealth()).resolves.toEqual({
      databaseBytes: 64 * 4096,
      freeBytes: 8 * 4096,
      tableCounts: {
        events: 120,
        deliveries: 340,
        deliveryAttempts: 512,
        oncallPings: 7,
      },
      oldestEventAt: "2026-06-01T00:00:00.000Z",
      newestEventAt: "2026-06-07T00:00:00.000Z",
    });
  });

  it("keeps empty event bounds null", async () => {
    const service = new StorageHealthService({
      store: {
        storageHealth: async () => ({
          ...SNAPSHOT,
          tableCounts: { events: 0, deliveries: 0, deliveryAttempts: 0, oncallPings: 0 },
          oldestEventAt: null,
          newestEventAt: null,
        }),
      },
    });

    await expect(service.getStorageHealth()).resolves.toMatchObject({
      tableCounts: { events: 0 },
      oldestEventAt: null,
      newestEventAt: null,
    });
  });

  it("reads the live store on every call", async () => {
    let calls = 0;
    const service = new StorageHealthService({
      store: {
        storageHealth: async () => {
          calls += 1;
          return { ...SNAPSHOT, tableCounts: { ...SNAPSHOT.tableCounts, events: calls } };
        },
      },
    });

    expect((await service.getStorageHealth()).tableCounts.events).toBe(1);
    expect((await service.getStorageHealth()).tableCounts.events).toBe(2);
  });
});
