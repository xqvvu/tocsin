import type { AppSettings } from "@tocsin/core";

import type { SqliteStore } from "#/infra/sqlite/store";

export interface AppSettingsServiceOptions {
  store: SqliteStore;
}

export type UpdateAppSettingsResult = AppSettings;
