import {
  DeliveryPauseActorSchema,
  DeliveryPauseRecordSchema,
  IsoDateTimeSchema,
  type DeliveryPauseRecord,
} from "@tocsin/core";
import { IanaTimeZoneSchema, LocaleSchema } from "@tocsin/core/presentation";

import type { SqliteRepositoryContext } from "#/infra/sqlite/context";
import {
  DEFAULT_DELIVERY_PAUSED,
  DEFAULT_LOCALE,
  DEFAULT_TIME_ZONE,
  DEFAULT_RAW_PAYLOAD_RETENTION_DAYS,
  DELIVERY_PAUSED_AT_KEY,
  DELIVERY_PAUSED_BY_KEY,
  DELIVERY_PAUSED_KEY,
  DELIVERY_PAUSE_LAST_KEY,
  LOCALE_KEY,
  RAW_PAYLOAD_RETENTION_DAYS_KEY,
  TIME_ZONE_KEY,
} from "#/infra/sqlite/repositories/settings/settings.helpers";
import type {
  AppSettings,
  SettingsRepository,
  SettingsUpdateInput,
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
      deliveryPausedBy: deliveryPaused
        ? await this.getParsedSetting<string | null>(
            DELIVERY_PAUSED_BY_KEY,
            DeliveryPauseActorSchema,
            null,
          )
        : null,
      // The completed interval survives the resume: it is the incident evidence
      // the console shows next to the toggle once delivery is running again.
      lastDeliveryPause: await this.getJsonSetting<DeliveryPauseRecord | null>(
        DELIVERY_PAUSE_LAST_KEY,
        DeliveryPauseRecordSchema,
        null,
      ),
    };
  }

  async update(input: SettingsUpdateInput): Promise<AppSettings> {
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
      const alreadyPaused = await this.getBooleanSetting(
        DELIVERY_PAUSED_KEY,
        DEFAULT_DELIVERY_PAUSED,
      );
      const actor = input.actor ?? null;

      if (input.deliveryPaused && !alreadyPaused) {
        // Keep the original start time and operator when the pause is already
        // active so a repeated toggle does not rewrite when the incident began.
        await this.setSetting(DELIVERY_PAUSED_AT_KEY, this.context.now());
        await this.setSetting(DELIVERY_PAUSED_BY_KEY, actor ?? "");
      } else if (!input.deliveryPaused && alreadyPaused) {
        const startedAt = await this.getParsedSetting<string | null>(
          DELIVERY_PAUSED_AT_KEY,
          IsoDateTimeSchema,
          null,
        );
        const pausedBy = await this.getParsedSetting<string | null>(
          DELIVERY_PAUSED_BY_KEY,
          DeliveryPauseActorSchema,
          null,
        );

        // Persist the completed interval before clearing the live fields, so
        // the console can still answer "who stopped delivery and for how long"
        // after the resume.
        if (startedAt) {
          await this.setSetting(
            DELIVERY_PAUSE_LAST_KEY,
            JSON.stringify({
              startedAt,
              endedAt: this.context.now(),
              pausedBy,
              resumedBy: actor,
            } satisfies DeliveryPauseRecord),
          );
        }

        await this.setSetting(DELIVERY_PAUSED_AT_KEY, "");
        await this.setSetting(DELIVERY_PAUSED_BY_KEY, "");
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

  /**
   * Reads a setting stored as JSON text.
   *
   * A hand-edited or half-written row must not crash the settings projection, so
   * unparsable JSON falls back like any other invalid value.
   */
  private async getJsonSetting<T>(
    key: string,
    schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
    fallback: T,
  ): Promise<T> {
    const row = await this.context.db
      .selectFrom("settings")
      .select("value")
      .where("key", "=", key)
      .executeTakeFirst();

    if (!row) {
      return fallback;
    }

    try {
      const parsed = schema.safeParse(JSON.parse(row.value) as unknown);

      return parsed.success ? parsed.data : fallback;
    } catch {
      return fallback;
    }
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
