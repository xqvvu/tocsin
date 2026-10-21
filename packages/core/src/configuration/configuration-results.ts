import {
  DestinationEditorDraftResultSchema,
  type DestinationEditorDraftResult,
} from "#core/destination/destination";
import type { Locale } from "#core/presentation";

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
