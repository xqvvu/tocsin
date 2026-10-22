/**
 * Raw SQLite storage counters read from the live database.
 *
 * This is an infrastructure snapshot, not a dashboard DTO: the API service
 * maps it field by field so no file path, pragma output, or driver value can
 * leak through as a raw object.
 */
export interface StorageHealthSnapshot {
  /** Total pages allocated to the database file, including free pages. */
  pageCount: number;
  pageSizeBytes: number;
  /** Pages on the freelist; high values mean the file can be compacted. */
  freePageCount: number;
  tableCounts: {
    events: number;
    deliveries: number;
    deliveryAttempts: number;
    oncallPings: number;
  };
  oldestEventAt: string | null;
  newestEventAt: string | null;
}

export function storageHealthBytes(snapshot: StorageHealthSnapshot): number {
  return snapshot.pageCount * snapshot.pageSizeBytes;
}

export function storageHealthFreeBytes(snapshot: StorageHealthSnapshot): number {
  return snapshot.freePageCount * snapshot.pageSizeBytes;
}
