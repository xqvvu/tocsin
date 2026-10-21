import { IsoDateTimeSchema } from "@tocsin/core";
import { IanaTimeZoneSchema, LocaleSchema } from "@tocsin/core/presentation";

import type { SqliteRepositoryContext } from "#/infra/sqlite/context";
import {
  DEFAULT_DELIVERY_PAUSED,
  DEFAULT_LOCALE,
  DEFAULT_TIME_ZONE,
  DEFAULT_RAW_PAYLOAD_RETENTION_DAYS,
  DELIVERY_PAUSED_AT_KEY,
  DELIVERY_PAUSED_KEY,
  LOCALE_KEY,
  RAW_PAYLOAD_RETENTION_DAYS_KEY,
  TIME_ZONE_KEY,
} from "#/infra/sqlite/repositories/settings/settings.helpers";
import type {
  AppSettings,
  SettingsRepository,
} from "#/infra/sqlite/repositories/settings/settings.interface";

export class SqliteSettingsRepository implements SettingsRepository {
  constructor(private readonly context: SqliteRepositoryContext) {}

  async get(): Promise<AppSettings> {
    const deliveryPaused = await this.getBooleanSetting(
      DELIVERY_PAUSED_KEY,
      DEFAULT_DELIVERY_PAUSED,
    );

    return {
      locale: await this.getParsedSetting(LOCALE_KEY, LocaleSchema, DEFAULT_LOCALE),
      timeZone: await this.getParsedSetting(TIME_ZONE_KEY, IanaTimeZoneSchema, DEFAULT_TIME_ZONE),
      rawPayloadRetentionDays: await this.getNumberSetting(
        RAW_PAYLOAD_RETENTION_DAYS_KEY,
        DEFAULT_RAW_PAYLOAD_RETENTION_DAYS,
      ),
      deliveryPaused,
      // A stale timestamp next to `deliveryPaused: false` is meaningless, so the
      // projection only surfaces it while the pause is active.
      deliveryPausedAt: deliveryPaused
        ? await this.getParsedSetting<string | null>(
            DELIVERY_PAUSED_AT_KEY,
            IsoDateTimeSchema,
            null,
          )
        : null,
    };
  }

  async update(input: Partial<AppSettings>): Promise<AppSettings> {
    if (input.locale !== undefined) {
      await this.setSetting(LOCALE_KEY, LocaleSchema.parse(input.locale));
    }

    if (input.timeZone !== undefined) {
      await this.setSetting(TIME_ZONE_KEY, IanaTimeZoneSchema.parse(input.timeZone));
    }

    if (input.rawPayloadRetentionDays !== undefined) {
      await this.setSetting(RAW_PAYLOAD_RETENTION_DAYS_KEY, String(input.rawPayloadRetentionDays));
    }

    if (input.deliveryPaused !== undefined) {
      if (input.deliveryPaused) {
        // Keep the original start time when the pause is already active so a
        // repeated toggle does not rewrite when the incident began.
        const alreadyPaused = await this.getBooleanSetting(
          DELIVERY_PAUSED_KEY,
          DEFAULT_DELIVERY_PAUSED,
        );

        if (!alreadyPaused) {
          await this.setSetting(DELIVERY_PAUSED_AT_KEY, this.context.now());
        }
      } else {
        await this.setSetting(DELIVERY_PAUSED_AT_KEY, "");
      }

      await this.setSetting(DELIVERY_PAUSED_KEY, input.deliveryPaused ? "true" : "false");
    }

    return this.get();
  }

  private async getBooleanSetting(key: string, fallback: boolean): Promise<boolean> {
    const row = await this.context.db
      .selectFrom("settings")
      .select("value")
      .where("key", "=", key)
      .executeTakeFirst();

    if (!row) {
      return fallback;
    }

    return row.value === "true";
  }

  private async getNumberSetting(key: string, fallback: number): Promise<number> {
    const row = await this.context.db
      .selectFrom("settings")
      .select("value")
      .where("key", "=", key)
      .executeTakeFirst();
    const value = row ? Number(row.value) : fallback;

    return Number.isFinite(value) ? value : fallback;
  }

  private async getParsedSetting<T>(
    key: string,
    schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
    fallback: T,
  ): Promise<T> {
    const row = await this.context.db
      .selectFrom("settings")
      .select("value")
      .where("key", "=", key)
      .executeTakeFirst();
    const parsed = schema.safeParse(row?.value);

    return parsed.success ? parsed.data : fallback;
  }

  private async setSetting(key: string, value: string): Promise<void> {
    const now = this.context.now();

    await this.context.db
      .insertInto("settings")
      .values({
        key,
        value,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc.column("key").doUpdateSet({
          value,
          updated_at: now,
        }),
      )
      .execute();
  }
}
