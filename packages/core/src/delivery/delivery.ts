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
  suppressionId: z.string().min(1).nullable(),
  suppressedAt: IsoDateTimeSchema.nullable(),
  suppressReason: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  finishedAt: IsoDateTimeSchema.nullable(),
});

export type DeliveryJob = z.infer<typeof DeliveryJobSchema>;

/** 目标系统里可反向操作的资产句柄，例如飞书消息的 message_id。 */
export const ProviderReferenceSchema = z.object({
  type: z.string().min(1),
  value: z.string().min(1),
});

export type ProviderReference = z.infer<typeof ProviderReferenceSchema>;
