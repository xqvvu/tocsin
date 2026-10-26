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

/** 目标系统里可反向操作的资产句柄，例如飞书消息的 message_id。 */
export const ProviderReferenceSchema = z.object({
  type: z.string().min(1),
  value: z.string().min(1),
});

export type ProviderReference = z.infer<typeof ProviderReferenceSchema>;
