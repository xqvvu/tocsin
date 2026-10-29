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

/**
 * History rows one configuration delete would remove through SQLite's
 * `ON DELETE CASCADE` foreign keys.
 *
 * The console discloses this before an irreversible delete so an operator can
 * see how much troubleshooting evidence the cascade takes with it. It is a
 * preview, not a receipt: the delete itself re-computes nothing and keeps the
 * hard-delete semantics described in `docs/prd/post-mvp-planning.md`.
 */
export const DeletionImpactSchema = z.strictObject({
  /** Events received by the source; 0 for route and destination deletes. */
  eventCount: z.number().int().nonnegative(),
  /** Deliveries carrying the deleted source, route, or destination. */
  deliveryCount: z.number().int().nonnegative(),
  /** Attempt rows of those deliveries. */
  attemptCount: z.number().int().nonnegative(),
  /** Urgent-call records attached to those deliveries or events. */
  oncallPingCount: z.number().int().nonnegative(),
});

export type DeletionImpact = z.infer<typeof DeletionImpactSchema>;

/**
 * What starts moving the moment a destination is re-enabled.
 *
 * A disabled destination stops the delivery worker and the urgent-call worker
 * from claiming its work, so re-enabling releases both backlogs at once. The
 * console shows these counts before the switch flips: automated phone calls
 * cannot be taken back once they ring.
 *
 * Delivery counts come from the existing pending-delivery projection; this
 * DTO only carries the urgent-call side, which has no other read path.
 */
export const DestinationEnablePreviewSchema = z.strictObject({
  /** Scheduled urgent-call pings with attempts left, waiting for the target. */
  scheduledUrgentCallCount: z.number().int().nonnegative(),
});

export type DestinationEnablePreview = z.infer<typeof DestinationEnablePreviewSchema>;

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
