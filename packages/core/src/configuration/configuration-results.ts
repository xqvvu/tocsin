import { z } from "zod";

import {
  DestinationEditorDraftResultSchema,
  type DestinationEditorDraftResult,
} from "#core/destination/destination";
import type { Locale } from "#core/presentation";

/**
 * A completed instance-wide delivery pause, kept as incident evidence.
 *
 * Delivery pauses are the emergency stop for outbound sending, so the console
 * has to answer "who stopped delivery, and when did it come back" without
 * opening the database. Actors are dashboard operator emails; `null` means the
 * write was not attributable (for example an older row recorded before actors
 * were captured).
 */
export const DeliveryPauseActorSchema = z.string().trim().min(1).max(320);

export const DeliveryPauseRecordSchema = z.object({
  startedAt: z.string().min(1),
  endedAt: z.string().min(1),
  pausedBy: DeliveryPauseActorSchema.nullable(),
  resumedBy: DeliveryPauseActorSchema.nullable(),
});

export type DeliveryPauseRecord = z.infer<typeof DeliveryPauseRecordSchema>;

export interface AppSettings {
  locale: Locale;
  timeZone: string;
  rawPayloadRetentionDays: number;
  /**
   * Operator emergency stop for outbound delivery. While paused the delivery
   * worker claims nothing and leaves every queued job untouched, so resuming
   * continues the backlog instead of dropping it.
   *
   * Not part of portable configuration export: this is instance runtime state,
   * not configuration an operator should copy between installs.
   */
  deliveryPaused: boolean;
  /** When the current pause started; `null` while delivery is running. */
  deliveryPausedAt: string | null;
  /** Dashboard operator who started the current pause; `null` while running. */
  deliveryPausedBy: string | null;
  /** Most recent completed pause interval; `null` until the first resume. */
  lastDeliveryPause: DeliveryPauseRecord | null;
}

/** Template-only alias kept for older call sites; prefer DestinationEditorDraftResult. */
export const DestinationTemplateDraftResultSchema = DestinationEditorDraftResultSchema;
export type DestinationTemplateDraftResult = DestinationEditorDraftResult;

export interface ImportConfigurationResult {
  generatedSourceTokens: Array<{
    sourceId: string;
    sourceName: string;
    token: string;
  }>;
}

export { DestinationEditorDraftResultSchema, type DestinationEditorDraftResult };
