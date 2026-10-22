import type { AppSettings } from "@tocsin/core";

import type { SqliteStore } from "#/infra/sqlite/store";

export interface AppSettingsServiceOptions {
  store: SqliteStore;
}

export interface UpdateAppSettingsOptions {
  /**
   * Dashboard operator email performing the change. Recorded only when the
   * command changes the global delivery pause, so the incident timeline can
   * name who stopped delivery and who resumed it. Omitted for in-process
   * callers such as configuration import.
   */
  actor?: string | null;
}

export type UpdateAppSettingsResult = AppSettings;
