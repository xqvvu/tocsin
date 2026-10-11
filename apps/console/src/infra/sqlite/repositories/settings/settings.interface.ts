import type { AppSettings } from "@tocsin/core";

export type { AppSettings } from "@tocsin/core";

export interface SettingsRepository {
  get(): Promise<AppSettings>;
  update(input: Partial<AppSettings>): Promise<AppSettings>;
}
