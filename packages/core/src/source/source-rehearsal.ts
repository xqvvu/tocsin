import { z } from "zod";

import { NormalizedEventSchema } from "#core/event/normalized-event";
import { JsonObjectSchema, JsonValueSchema } from "#core/json";
import { RouteMatchCheckSchema, RouteMatchResultSchema } from "#core/route/route";
import { SourceSummarySchema } from "#core/source/source";
import { SuppressionKindSchema } from "#core/suppression/suppression";

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
 * Whether the rehearsed delivery would actually reach its target.
 *
 * A rehearsal renders a matched target even when production would never send
 * the alert, so the result has to say which gate the real chain would hit, in
 * the order enqueue applies them: `deduped` skips the row entirely, `suppressed`
 * is terminal at enqueue, `destination_disabled` is never claimed,
 * `queued_paused` is enqueued but waits out a global pause, and `deliver` passes
 * every gate.
 */
export const SourceRehearsalVerdictSchema = z.enum([
  "deliver",
  "deduped",
  "suppressed",
  "queued_paused",
  "destination_disabled",
]);
export type SourceRehearsalVerdict = z.infer<typeof SourceRehearsalVerdictSchema>;

/**
 * Whether the intake dedupe window would absorb the rehearsed delivery.
 *
 * The real enqueue path skips a `(route, destination)` pair without creating a
 * row when the same `(source, idempotency key, route, destination)` was already
 * enqueued inside the window, so a rehearsal that only rendered the target
 * would promise a delivery production never creates. `not_applicable` means the
 * parser produced no idempotency key, in which case the real intake never
 * dedupes either.
 */
export const SourceRehearsalDedupeStateSchema = z.enum([
  "not_applicable",
  "would_deliver",
  "would_dedupe",
  "partially_deduped",
]);
export type SourceRehearsalDedupeState = z.infer<typeof SourceRehearsalDedupeStateSchema>;

/**
 * The dedupe window the rehearsal checked, for one matched target.
 *
 * A target can be reached by several routes and the key includes the route, so
 * the result reports how many of this destination's pairs still sit inside the
 * window. `firstEventId` is the earliest event that opened the window; it is
 * null unless at least one pair hits.
 */
export const SourceRehearsalDedupeSchema = z.object({
  state: SourceRehearsalDedupeStateSchema,
  /** Length of the dedupe window the intake applies, in milliseconds. */
  windowMs: z.number().int().positive(),
  /** Server clock minus the configured dedupe window. */
  windowStartsAt: z.string(),
  /** Matched `(route, target)` pairs for this destination. */
  matchedPairCount: z.number().int().nonnegative(),
  /** How many of those pairs already have an in-window key. */
  dedupedPairCount: z.number().int().nonnegative(),
  /** Route whose key hit first; null when no pair hits. */
  routeId: z.string().min(1).nullable(),
  routeName: z.string().nullable(),
  /** Event that opened the window; the rehearsal links to it. */
  firstEventId: z.string().min(1).nullable(),
});
export type SourceRehearsalDedupe = z.infer<typeof SourceRehearsalDedupeSchema>;

/**
 * The suppression rule that would silence the rehearsed delivery.
 *
 * `reason` mirrors the audit text written to `deliveries.suppress_reason`, and
 * `checks` is the same per-condition evidence a route match shows; the server
 * redacts the check values before returning, exactly like route matches.
 */
export const SourceRehearsalSuppressionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: SuppressionKindSchema,
  reason: z.string(),
  checks: z.array(RouteMatchCheckSchema),
});
export type SourceRehearsalSuppression = z.infer<typeof SourceRehearsalSuppressionSchema>;

/**
 * Global delivery state at the rehearsal instant.
 *
 * `pausedAt` is the server timestamp recorded when the pause started, so the
 * result explains a `queued_paused` verdict without a second settings read.
 */
export const SourceRehearsalDeliverySchema = z.object({
  paused: z.boolean(),
  pausedAt: z.string().nullable(),
});
export type SourceRehearsalDelivery = z.infer<typeof SourceRehearsalDeliverySchema>;

/**
 * What a matched destination would send for the rehearsed event.
 *
 * Rendering only: the adapter's transport is never called. `renderedPayload` is
 * the same JSON text the operator sees in the destination preview, redacted.
 * `verdict` reports what the real delivery chain would do with the same event.
 */
export const SourceRehearsalRenderSchema = z.object({
  destinationId: z.string().min(1),
  destinationName: z.string(),
  enabled: z.boolean(),
  ok: z.boolean(),
  renderedPayload: z.string(),
  /** Null when rendering succeeded; a redacted message otherwise. */
  errorMessage: z.string().nullable(),
  verdict: SourceRehearsalVerdictSchema,
  /** The rule that would silence this delivery; null when none matches. */
  suppression: SourceRehearsalSuppressionSchema.nullable(),
  /** Whether the dedupe window would skip this target at enqueue. */
  dedupe: SourceRehearsalDedupeSchema,
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
  /** Global delivery state at the rehearsal instant. */
  delivery: SourceRehearsalDeliverySchema,
  /** Rendered previews for the destinations of matched routes. */
  renders: z.array(SourceRehearsalRenderSchema),
});
export type SourceRehearsalResult = z.infer<typeof SourceRehearsalResultSchema>;
