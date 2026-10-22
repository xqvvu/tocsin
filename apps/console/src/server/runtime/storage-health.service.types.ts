import type { SqliteStore } from "#/infra/sqlite/store";

export interface StorageHealthServiceOptions {
  store: Pick<SqliteStore, "storageHealth">;
}
