import {
  DeliveryPauseRecordSchema,
  IanaTimeZoneSchema,
  IsoDateTimeSchema,
  LocaleSchema,
} from "@tocsin/core";
import * as z from "zod";

/** Console runtime settings owned by the dashboard operator. */
export const AppSettingsOutputSchema = z.object({
  locale: LocaleSchema,
  timeZone: IanaTimeZoneSchema,
  rawPayloadRetentionDays: z.number().int().min(0),
  deliveryPaused: z.boolean(),
  deliveryPausedAt: IsoDateTimeSchema.nullable(),
  deliveryPausedBy: z.string().nullable(),
  lastDeliveryPause: DeliveryPauseRecordSchema.nullable(),
});

/**
 * Read-only projection of the running process and its effective limits.
 *
 * Every field is an explicitly whitelisted value; environment variables and
 * secrets never pass through as raw objects.
 */
export const RuntimeInformationOutputSchema = z.object({
  version: z.string(),
  nodeVersion: z.string(),
  platform: z.string(),
  architecture: z.string(),
  environment: z.string(),
  sqliteDriver: z.literal("better-sqlite3"),
  sqliteVersion: z.string(),
  destinationTimeoutMs: z.number().int().positive(),
  maxWebhookBytes: z.number().int().positive(),
  workerBatchSize: z.number().int().positive(),
  workerIntervalMs: z.number().int().positive(),
  workerStaleRunningMs: z.number().int().positive(),
  logFormat: z.enum(["auto", "json", "text"]),
  logLevel: z.enum(["trace", "debug", "info", "warning", "error", "fatal", "off"]),
});

export type RuntimeInformation = z.infer<typeof RuntimeInformationOutputSchema>;

/**
 * Read-only storage projection for self-hosted operators.
 *
 * Counts are whole-table totals so an operator can see history growth without
 * opening the database. No path, pragma output, payload, or credential is
 * included.
 */
export const StorageHealthOutputSchema = z.object({
  databaseBytes: z.number().int().nonnegative(),
  freeBytes: z.number().int().nonnegative(),
  tableCounts: z.object({
    events: z.number().int().nonnegative(),
    deliveries: z.number().int().nonnegative(),
    deliveryAttempts: z.number().int().nonnegative(),
    oncallPings: z.number().int().nonnegative(),
  }),
  oldestEventAt: IsoDateTimeSchema.nullable(),
  newestEventAt: IsoDateTimeSchema.nullable(),
});

export type StorageHealth = z.infer<typeof StorageHealthOutputSchema>;
