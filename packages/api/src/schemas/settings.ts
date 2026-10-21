import { IanaTimeZoneSchema, IsoDateTimeSchema, LocaleSchema } from "@tocsin/core";
import * as z from "zod";

/** Console runtime settings owned by the dashboard operator. */
export const AppSettingsOutputSchema = z.object({
  locale: LocaleSchema,
  timeZone: IanaTimeZoneSchema,
  rawPayloadRetentionDays: z.number().int().min(0),
  deliveryPaused: z.boolean(),
  deliveryPausedAt: IsoDateTimeSchema.nullable(),
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
