import type { StorageHealth } from "@tocsin/api";

import { storageHealthBytes, storageHealthFreeBytes } from "#/infra/sqlite/storage-health";
import type { StorageHealthServiceOptions } from "#/server/runtime/storage-health.service.types";

/**
 * Read-only storage projection for the settings screen.
 *
 * The SQLite snapshot is mapped field by field into the API DTO, so page
 * bookkeeping and driver-level values never reach the browser unchanged.
 */
export class StorageHealthService {
  private readonly store: StorageHealthServiceOptions["store"];

  constructor(options: StorageHealthServiceOptions) {
    this.store = options.store;
  }

  async getStorageHealth(): Promise<StorageHealth> {
    const snapshot = await this.store.storageHealth();

    return {
      databaseBytes: storageHealthBytes(snapshot),
      freeBytes: storageHealthFreeBytes(snapshot),
      tableCounts: {
        events: snapshot.tableCounts.events,
        deliveries: snapshot.tableCounts.deliveries,
        deliveryAttempts: snapshot.tableCounts.deliveryAttempts,
        oncallPings: snapshot.tableCounts.oncallPings,
      },
      oldestEventAt: snapshot.oldestEventAt,
      newestEventAt: snapshot.newestEventAt,
    };
  }
}
