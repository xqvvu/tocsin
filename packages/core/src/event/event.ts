import { z } from "zod";

import { IsoDateTimeSchema, NormalizedEventSchema } from "#core/event/normalized-event";
import { JsonObjectSchema, JsonValueSchema, type JsonObject } from "#core/json";
import { RouteMatchResultsSchema } from "#core/route/route";

export const EventRecordSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  idempotencyKey: z.string().min(1).nullable(),
  normalized: NormalizedEventSchema,
  providerMetadata: JsonObjectSchema.default({}),
  rawPayload: JsonValueSchema,
  rawHeaders: z.record(z.string(), z.string()).default({}),
  routeMatches: RouteMatchResultsSchema.nullable().default(null),
  receivedAt: IsoDateTimeSchema,
});

export type EventRecord = z.infer<typeof EventRecordSchema>;

/**
 * How many alerts the upstream notification group carried, as the provider
 * parser recorded it in `providerMetadata.alertCount`.
 *
 * Group-based providers collapse every alert in a group into the first one, so
 * this number is the only record of the group size. It is absent for providers
 * without that concept, for payloads the parser could not read a count from,
 * and for Events stored before parsers recorded one — callers render an empty
 * string rather than inventing `1`.
 */
export function readProviderAlertCount(providerMetadata: JsonObject): number | undefined {
  const value = providerMetadata.alertCount;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
