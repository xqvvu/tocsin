import { z } from "zod";

import { FEISHU_MAX_URGENT_RECEIVERS } from "#destinations/shared/feishu-protocol";
import type {
  DestinationErrorKind,
  DestinationRetryHint,
  DestinationTransportContext,
} from "#destinations/types";

/**
 * Urgency channels are the "call a human" family beside the destination
 * adapters: a destination *notifies*, an urgency channel *pages*. The kind enum
 * is closed and grows by explicit extension, mirroring `DestinationKind`.
 */
export const UrgencyChannelKindSchema = z.enum(["feishu_urgent_phone"]);
export type UrgencyChannelKind = z.output<typeof UrgencyChannelKindSchema>;

/** Reuses the package-wide transport failure vocabulary of the destination adapters. */
export type UrgencyErrorKind = DestinationErrorKind;
export type UrgencyRetryHint = DestinationRetryHint;

/**
 * Platform limit for one urgent call: the endpoint validates that the receiver
 * list is at most {@link FEISHU_MAX_URGENT_RECEIVERS} ids. Tocsin pages one receiver per ping, so the cap is a
 * guard against a hand-built input rather than a normal operating point.
 */
export const MAX_URGENCY_RECEIVERS = FEISHU_MAX_URGENT_RECEIVERS;

export const UrgencyPingInputSchema = z.object({
  app: z.object({
    appId: z.string().trim().min(1),
    appSecret: z.string().min(1),
  }),
  messageId: z.string().trim().min(1),
  receivers: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(MAX_URGENCY_RECEIVERS, {
      message: `Urgent phone receivers cannot exceed ${MAX_URGENCY_RECEIVERS}`,
    })
    .refine((receivers) => new Set(receivers).size === receivers.length, {
      message: "Urgent phone receivers must be unique",
    }),
  userIdType: z.enum(["open_id", "user_id", "union_id"]),
});
export type UrgencyPingInput = z.input<typeof UrgencyPingInputSchema>;

export interface UrgencyPingResultBase {
  statusCode: number | null;
  responseBody: string | null;
}

export type UrgencyPingResult =
  | (UrgencyPingResultBase & {
      ok: true;
    })
  | (UrgencyPingResultBase & {
      ok: false;
      errorKind: UrgencyErrorKind;
      retryHint: UrgencyRetryHint;
      errorMessage: string;
    });

export interface UrgencyChannelAdapter<Kind extends UrgencyChannelKind = UrgencyChannelKind> {
  kind: Kind;

  /**
   * Places an urgent phone call for a message that already exists.
   *
   * `messageId` identifies a message the app itself sent — in practice a
   * delivery's captured provider reference. The channel escalates that message;
   * it never sends one of its own.
   */
  ping(input: UrgencyPingInput, context?: DestinationTransportContext): Promise<UrgencyPingResult>;
}
