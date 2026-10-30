import {
  AlertSeveritySchema,
  DestinationKindSchema,
  IsoDateTimeSchema,
  SuppressionSchema,
} from "@tocsin/core";
import * as z from "zod";

import { DeliveryListItemSchema } from "./operations";
import { IdOutputSchema, NumberedPageSchema } from "./shared";

/**
 * Suppression rule DTOs.
 *
 * The wire shape is the domain shape: `state` is deliberately absent, because
 * the lifecycle state is a function of `enabled`/`startsAt`/`endsAt` versus the
 * caller's clock (`suppressionStateAt`), never a stored column.
 */
export const SuppressionListOutputSchema = z.array(SuppressionSchema);

export const SuppressionOutputSchema = SuppressionSchema;

export const SuppressionDeleteOutputSchema = IdOutputSchema;

export const SuppressionDetailInputSchema = z.object({
  id: z.string().min(1),
});

export const SuppressionHitsInputSchema = SuppressionDetailInputSchema.extend({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

/** The deliveries a rule silenced, newest page first, shaped like every other list. */
export const SuppressionHitsOutputSchema = NumberedPageSchema(DeliveryListItemSchema);

export const SuppressionImpactSeveritySchema = z.object({
  severity: AlertSeveritySchema,
  deliveryCount: z.number().int().nonnegative(),
});

export const SuppressionImpactDestinationSchema = z.object({
  destinationId: z.string().min(1),
  destinationName: z.string().min(1),
  kind: DestinationKindSchema,
  deliveryCount: z.number().int().nonnegative(),
});

/**
 * The blast radius of one rule over its whole window, aggregated over every
 * delivery it silenced.
 *
 * Deliberately derived from `deliveries.suppression_id` rather than stored:
 * the database clears that column when the rule is deleted, so this summary
 * cannot present a deleted rule as still affecting live traffic. The per-hit
 * audit trail stays on the delivery rows themselves.
 */
export const SuppressionImpactOutputSchema = z.object({
  deliveryCount: z.number().int().nonnegative(),
  eventCount: z.number().int().nonnegative(),
  sourceCount: z.number().int().nonnegative(),
  destinationCount: z.number().int().nonnegative(),
  firstHitAt: IsoDateTimeSchema.nullable(),
  lastHitAt: IsoDateTimeSchema.nullable(),
  /** Per-severity counts in the console's canonical critical → unknown order. */
  severities: z.array(SuppressionImpactSeveritySchema),
  /** Top destinations by silenced volume; the rest are counted, not listed. */
  destinations: z.array(SuppressionImpactDestinationSchema),
});

export type SuppressionImpactOutput = z.infer<typeof SuppressionImpactOutputSchema>;
