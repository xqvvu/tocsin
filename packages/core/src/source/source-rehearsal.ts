import { z } from "zod";

import { NormalizedEventSchema } from "#core/event/normalized-event";
import { JsonObjectSchema, JsonValueSchema } from "#core/json";
import { RouteMatchResultSchema } from "#core/route/route";
import { SourceSummarySchema } from "#core/source/source";

/**
 * Read-only intake rehearsal for a Source.
 *
 * The operator pastes an upstream webhook body and Tocsin replays it through the
 * Source's provider parser and the current route rules. Nothing is persisted,
 * no Delivery is enqueued, and no destination is contacted, so this can be run
 * against production rules before the upstream sender is pointed at Tocsin.
 */
/** Upper bound for a pasted body so a rehearsal cannot be used as a bulk import. */
export const SOURCE_REHEARSAL_PAYLOAD_MAX_CHARS = 256 * 1024;

export const RehearseSourceCommandSchema = z
  .object({
    sourceId: z.string().min(1),
    /** The upstream webhook body, already parsed from the editor's JSON text. */
    payload: JsonValueSchema,
  })
  .refine((value) => JSON.stringify(value.payload).length <= SOURCE_REHEARSAL_PAYLOAD_MAX_CHARS, {
    message: "Webhook body is too large for a rehearsal",
    path: ["payload"],
  });
export type RehearseSourceCommand = z.input<typeof RehearseSourceCommandSchema>;

/**
 * Mirrors `ProviderParseFailureReason` from `@tocsin/providers`. Core cannot
 * depend on the providers package, so the literal set is repeated here; the
 * console service maps the provider result into this schema (a mismatch fails
 * the output parse instead of reaching the browser).
 */
export const SourceRehearsalParseFailureReasonSchema = z.enum([
  "invalid_payload",
  "unsupported_payload",
  "configuration_error",
  "unknown_error",
]);
export type SourceRehearsalParseFailureReason = z.infer<
  typeof SourceRehearsalParseFailureReasonSchema
>;

export const SourceRehearsalParseSuccessSchema = z.object({
  ok: z.literal(true),
  normalizedEvent: NormalizedEventSchema,
  providerMetadata: JsonObjectSchema,
});

export const SourceRehearsalParseFailureSchema = z.object({
  ok: z.literal(false),
  reason: SourceRehearsalParseFailureReasonSchema,
  /** Redacted before it leaves the server; may quote the payload. */
  message: z.string(),
});

export const SourceRehearsalParseSchema = z.discriminatedUnion("ok", [
  SourceRehearsalParseSuccessSchema,
  SourceRehearsalParseFailureSchema,
]);
export type SourceRehearsalParse = z.infer<typeof SourceRehearsalParseSchema>;

/**
 * What a matched destination would send for the rehearsed event.
 *
 * Rendering only: the adapter's transport is never called. `renderedPayload` is
 * the same JSON text the operator sees in the destination preview, redacted.
 */
export const SourceRehearsalRenderSchema = z.object({
  destinationId: z.string().min(1),
  destinationName: z.string(),
  enabled: z.boolean(),
  ok: z.boolean(),
  renderedPayload: z.string(),
  /** Null when rendering succeeded; a redacted message otherwise. */
  errorMessage: z.string().nullable(),
});
export type SourceRehearsalRender = z.infer<typeof SourceRehearsalRenderSchema>;

export const SourceRehearsalResultSchema = z.object({
  source: SourceSummarySchema,
  /** Server clock used for the parse, echoed so the UI can label the run. */
  receivedAt: z.string(),
  parse: SourceRehearsalParseSchema,
  /**
   * One entry per current route, matched or not, so an operator can see which
   * condition rejected the payload instead of only the routes that passed.
   */
  routes: z.array(RouteMatchResultSchema),
  /** Rendered previews for the destinations of matched routes. */
  renders: z.array(SourceRehearsalRenderSchema),
});
export type SourceRehearsalResult = z.infer<typeof SourceRehearsalResultSchema>;
