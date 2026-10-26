import { z } from "zod";

import { IsoDateTimeSchema } from "#core/event/normalized-event";

export const DeliveryStateSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "failed",
  "suppressed",
]);
export type DeliveryState = z.infer<typeof DeliveryStateSchema>;

export const DeliveryJobSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  destinationId: z.string().min(1),
  routeId: z.string().min(1).nullable(),
  state: DeliveryStateSchema,
  attemptCount: z.number().int().min(0),
  maxAttempts: z.number().int().min(1),
  nextAttemptAt: IsoDateTimeSchema.nullable(),
  lastError: z.string().nullable(),
  /**
   * Audit evidence for a `suppressed` delivery: the rule that silenced it, when,
   * and a human-readable reason snapshot. All three stay readable after the rule
   * is deleted (`suppression_id` is nulled by the FK, the snapshot is not).
   */
  // Defaulted rather than merely nullable: a delivery row or snapshot written
  // before these columns existed parses to "no suppression evidence" instead of
  // failing, the same way `DeliveryListItem.destinationKind` tolerates its own
  // addition.
  suppressionId: z.string().min(1).nullable().default(null),
  suppressedAt: IsoDateTimeSchema.nullable().default(null),
  suppressReason: z.string().nullable().default(null),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  finishedAt: IsoDateTimeSchema.nullable(),
});

export type DeliveryJob = z.infer<typeof DeliveryJobSchema>;

/**
 * Terminal failure recorded when the destination accepted the alert but the
 * success write failed twice.
 *
 * The value is persisted verbatim, so it doubles as the marker that the target
 * has already been notified: `retryNow` refuses to re-queue a delivery carrying
 * it and the console hides the retry action. Keep the text stable —
 * rows written before the guard existed are recognised by this same value.
 */
export const DELIVERY_ACCEPTED_UNRECORDED_ERROR =
  "The destination accepted the alert, but recording success failed. " +
  "The alert was already delivered — do not resend it.";

/**
 * Whether a delivery failed *after* the destination accepted it.
 *
 * Prefix matching tolerates a future suffix being appended to the stored
 * message without turning an already-delivered row back into a retryable one.
 */
export function isDeliveryAcceptedUnrecorded(lastError: string | null): boolean {
  return lastError?.startsWith(DELIVERY_ACCEPTED_UNRECORDED_ERROR) ?? false;
}

/**
 * Recorded when a worker disappeared mid-attempt (a restart, an OOM kill)
 * before the send's result reached the database. Unlike the accepted-but-
 * unrecorded marker, the outcome is genuinely unknown: the target may or may
 * not have received the alert. Automatic retries stay enabled, because the
 * delivery might never have left the host.
 *
 * The value is persisted verbatim, so `redactText` must leave it unchanged.
 */
export const DELIVERY_OUTCOME_UNKNOWN_RETRY_ERROR =
  "The delivery attempt ended without a recorded result; the target may or may not " +
  "have received the alert. A retry is scheduled automatically.";

/**
 * Terminal variant of `DELIVERY_OUTCOME_UNKNOWN_RETRY_ERROR`, written when the
 * stale attempt exhausted its retry budget. Automatic retries stop, so the
 * message tells the operator to check the target before retrying by hand.
 *
 * This is *not* a do-not-resend marker: an unknown outcome must stay manually
 * retryable, and `isDeliveryAcceptedUnrecorded` must not match it.
 */
export const DELIVERY_OUTCOME_UNKNOWN_FINAL_ERROR =
  "The delivery attempt ended without a recorded result; the target may or may not " +
  "have received the alert. Automatic retries stopped; verify with the target " +
  "before retrying.";

/** 目标系统里可反向操作的资产句柄，例如飞书消息的 message_id。 */
export const ProviderReferenceSchema = z.object({
  type: z.string().min(1),
  value: z.string().min(1),
});

export type ProviderReference = z.infer<typeof ProviderReferenceSchema>;
