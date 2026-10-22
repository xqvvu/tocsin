import type { AppSettings, Locale } from "@tocsin/core";

export type { AppSettings } from "@tocsin/core";

/**
 * Writable settings fields.
 *
 * Deliberately narrower than `Partial<AppSettings>`: the projection also carries
 * read-only incident evidence (`deliveryPausedAt`, `deliveryPausedBy`,
 * `lastDeliveryPause`) that must never be written back as a side effect of an
 * unrelated update.
 */
export interface SettingsUpdateInput {
  locale?: Locale;
  timeZone?: string;
  rawPayloadRetentionDays?: number;
  deliveryPaused?: boolean;
  /**
   * Dashboard operator performing the write. Only read when the input changes
   * the delivery pause, so editing locale or retention cannot rewrite who
   * stopped delivery.
   */
  actor?: string | null;
}

export interface SettingsRepository {
  get(): Promise<AppSettings>;
  update(input: SettingsUpdateInput): Promise<AppSettings>;
}
