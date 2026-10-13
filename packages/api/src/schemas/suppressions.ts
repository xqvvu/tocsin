import { SuppressionSchema } from "@tocsin/core";
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
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** The deliveries a rule silenced, newest page first, shaped like every other list. */
export const SuppressionHitsOutputSchema = NumberedPageSchema(DeliveryListItemSchema);
