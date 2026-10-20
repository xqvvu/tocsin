import { z } from "zod";

import { AlertSeveritySchema, AlertStatusSchema } from "#core/event/normalized-event";
import {
  LabelMatchOperatorSchema,
  RouteMatchCheckSchema,
  evaluateContainsAll,
  evaluateLabels,
  evaluateOneOf,
  evaluateSource,
} from "#core/route/route";
import type { RouteMatchCheck } from "#core/route/route";

const NonEmptySuppressionStringSchema = z.string().trim().min(1);

/**
 * Why a suppression exists, as an operator intent. Both kinds share one
 * mechanism; this only drives copy and the default duration in the UI.
 */
export const SuppressionKindSchema = z.enum(["silence", "maintenance_window"]);
export type SuppressionKind = z.infer<typeof SuppressionKindSchema>;

/**
 * What a suppression matches on.
 *
 * Deliberately the same vocabulary as RouteRule (equals / contains, empty array
 * = no restriction on that dimension) so an operator does not learn a second
 * matching language. It adds two dimensions a route rule has no need for:
 * `destinationIds` (silence this target, not that one) and `fingerprints`
 * (silence one recurring alert by exact identity).
 */
export const SuppressionMatcherSchema = z.strictObject({
  sourceIds: z.array(NonEmptySuppressionStringSchema).default([]),
  destinationIds: z.array(NonEmptySuppressionStringSchema).default([]),
  severities: z.array(AlertSeveritySchema).default([]),
  statuses: z.array(AlertStatusSchema).default([]),
  fingerprints: z.array(NonEmptySuppressionStringSchema).default([]),
  labels: z
    .array(
      z.strictObject({
        key: NonEmptySuppressionStringSchema,
        operator: LabelMatchOperatorSchema.default("equals"),
        value: NonEmptySuppressionStringSchema,
      }),
    )
    .default([]),
  titleContains: z.array(NonEmptySuppressionStringSchema).default([]),
  messageContains: z.array(NonEmptySuppressionStringSchema).default([]),
});

export const SuppressionSchema = z.object({
  id: NonEmptySuppressionStringSchema,
  name: z.string().trim().min(1),
  kind: SuppressionKindSchema,
  enabled: z.boolean().default(true),
  reason: z.string().nullable().default(null),
  matcher: SuppressionMatcherSchema,
  startsAt: z.string().min(1),
  /** Non-nullable by owner ruling (2026-10-12): a suppression always self-heals. */
  endsAt: z.string().min(1),
  createdBy: z.string().nullable().default(null),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export type Suppression = z.infer<typeof SuppressionSchema>;
export type SuppressionMatcher = z.infer<typeof SuppressionMatcherSchema>;
export type SuppressionMatcherInput = z.input<typeof SuppressionMatcherSchema>;

/**
 * Time-based lifecycle projection.
 *
 * `expired` is derived, never stored: it is a function of `endsAt` versus now,
 * so storing it would be a second source of truth that can go stale.
 *
 * `disabled` outranks `expired` for display — an operator who switched a rule
 * off wants to see that, not that its window also lapsed.
 */
export const SuppressionStateSchema = z.enum(["scheduled", "active", "expired", "disabled"]);
export type SuppressionState = z.infer<typeof SuppressionStateSchema>;

export function suppressionStateAt(suppression: Suppression, now: string): SuppressionState {
  if (!suppression.enabled) {
    return "disabled";
  }

  const nowMs = Date.parse(now);
  const startsAtMs = Date.parse(suppression.startsAt);
  const endsAtMs = Date.parse(suppression.endsAt);

  // The API accepts any zoned timestamp, so compare instants rather than
  // strings: `2026-10-20T10:00:00+08:00` is 02:00Z, and a lexical comparison
  // would keep the rule scheduled for eight extra hours (or silence too long).
  if (Number.isNaN(nowMs) || Number.isNaN(startsAtMs) || Number.isNaN(endsAtMs)) {
    return stateFromLexicalOrder(suppression, now);
  }

  if (nowMs < startsAtMs) {
    return "scheduled";
  }

  if (nowMs >= endsAtMs) {
    return "expired";
  }

  return "active";
}

/**
 * Fallback for rows or clocks that cannot be parsed.
 *
 * Stored rules always come from validated ISO input, but a row written before
 * timestamp validation (or a hand-edited database) must not become "active"
 * just because every comparison with `NaN` is false — that would mute alerts.
 * Keeping the previous lexical ordering makes the failure mode unchanged.
 */
function stateFromLexicalOrder(suppression: Suppression, now: string): SuppressionState {
  if (now < suppression.startsAt) {
    return "scheduled";
  }

  if (now >= suppression.endsAt) {
    return "expired";
  }

  return "active";
}

/**
 * Whether a suppression is in force at `now`.
 *
 * Both bounds are honoured: `now` must lie in `[startsAt, endsAt)`, so a window
 * that has ended cannot silence anything even if it was never disabled.
 */
export function suppressionIsActive(suppression: Suppression, now: string): boolean {
  return suppressionStateAt(suppression, now) === "active";
}

/**
 * The fields of an event a suppression can examine.
 *
 * Structural on purpose: the same evaluation runs at intake (where a full
 * `NormalizedEvent` with `occurredAt` is available) and at delivery claim time.
 * Asking only for what the comparison actually reads keeps both callers honest
 * and means a suppression cannot silently see less than it claims to.
 */
export const SuppressionEventSchema = z.object({
  severity: AlertSeveritySchema,
  status: AlertStatusSchema,
  fingerprint: z.string(),
  title: z.string(),
  message: z.string(),
  labels: z.record(z.string(), z.string()),
});

export const SuppressionMatchInputSchema = z.object({
  sourceId: NonEmptySuppressionStringSchema,
  destinationId: NonEmptySuppressionStringSchema,
  event: SuppressionEventSchema,
});

export type SuppressionEvent = z.infer<typeof SuppressionEventSchema>;
export type SuppressionMatchInput = z.infer<typeof SuppressionMatchInputSchema>;

export const SuppressionMatchResultSchema = z.object({
  suppressionId: z.string().min(1),
  suppressionName: z.string().min(1),
  matched: z.boolean(),
  checks: z.array(RouteMatchCheckSchema),
});

export type SuppressionMatchResult = z.infer<typeof SuppressionMatchResultSchema>;

/**
 * Decide whether one suppression silences one `(event, destination)` delivery.
 *
 * Calls the route engine's own per-condition evaluators rather than
 * reimplementing the comparison: a suppression that matched differently from a
 * route given the same condition would be a bug that is very hard to explain to
 * an operator, and this sits on the path that decides whether an alert is
 * delivered at all. The suppression-only dimensions (`destinationIds`,
 * `fingerprints`) are evaluated here and appended to the same `checks` list, so
 * the console renders this evidence with the component it already uses for
 * route matches.
 */
export function evaluateSuppressionMatch(
  suppression: {
    id: string;
    name: string;
    /**
     * The *input* shape, not the parsed one: every dimension defaults to an
     * empty array, and callers legitimately supply only the dimensions they
     * care about. The defaults are applied by the parse below.
     */
    matcher: SuppressionMatcherInput;
  },
  input: SuppressionMatchInput,
): SuppressionMatchResult {
  const matcher = SuppressionMatcherSchema.parse(suppression.matcher);
  const event = input.event;
  const checks: RouteMatchCheck[] = [];

  evaluateSource(matcher.sourceIds, input.sourceId, checks);
  evaluateOneOf("severity", matcher.severities, event.severity, checks);
  evaluateOneOf("status", matcher.statuses, event.status, checks);
  evaluateLabels(matcher.labels, event, checks);
  evaluateContainsAll("title", matcher.titleContains, event.title, checks);
  evaluateContainsAll("message", matcher.messageContains, event.message, checks);
  evaluateDestinationIds(matcher.destinationIds, input.destinationId, checks);
  evaluateFingerprints(matcher.fingerprints, event.fingerprint, checks);

  return {
    suppressionId: suppression.id,
    suppressionName: suppression.name,
    matched: checks.every((check) => check.matched),
    checks,
  };
}

function evaluateDestinationIds(
  expected: string[],
  actualDestinationId: string,
  checks: RouteMatchCheck[],
): void {
  if (expected.length === 0) {
    checks.push({
      field: "destination",
      matched: true,
      detail: "No destination condition",
      condition: "none",
    });
    return;
  }

  checks.push({
    field: "destination",
    matched: expected.includes(actualDestinationId),
    detail: `Expected one of ${expected.join(", ")}, received ${actualDestinationId}`,
    condition: "compare",
    expected,
    actual: actualDestinationId,
  });
}

function evaluateFingerprints(
  expected: string[],
  actualFingerprint: string,
  checks: RouteMatchCheck[],
): void {
  if (expected.length === 0) {
    checks.push({
      field: "fingerprint",
      matched: true,
      detail: "No fingerprint condition",
      condition: "none",
    });
    return;
  }

  checks.push({
    field: "fingerprint",
    matched: expected.includes(actualFingerprint),
    detail: `Expected one of ${expected.join(", ")}, received ${actualFingerprint}`,
    condition: "compare",
    expected,
    actual: actualFingerprint,
  });
}

/**
 * Pick the single suppression that silences a delivery.
 *
 * At most one rule may claim a delivery, so the choice has to be deterministic:
 * ordering is by `startsAt` then `id`, which is stable regardless of the order
 * the caller happened to load rows in. Without this, "which rule silenced this?"
 * would depend on query order and the audit trail would be unreliable.
 */
export function selectSuppressionForDelivery(
  suppressions: Suppression[],
  input: SuppressionMatchInput,
  now: string,
): SuppressionMatchResult | null {
  const candidates = suppressions
    .filter((suppression) => suppressionIsActive(suppression, now))
    .map((suppression) => ({
      suppression,
      result: evaluateSuppressionMatch(suppression, input),
    }))
    .filter(({ result }) => result.matched)
    .sort(
      (left, right) =>
        left.suppression.startsAt.localeCompare(right.suppression.startsAt) ||
        left.suppression.id.localeCompare(right.suppression.id),
    );

  return candidates[0]?.result ?? null;
}

const SUPPRESSION_KIND_LABEL: Record<SuppressionKind, string> = {
  silence: "Silence",
  maintenance_window: "Maintenance window",
};

/**
 * Render the audit snapshot written to `deliveries.suppress_reason` (PRD 2.5).
 *
 * The snapshot must stay readable after the rule is deleted or pruned, so it
 * carries the rule's name and kind as *text* plus the conditions that decided
 * the match — never a reference the reader would have to resolve. Conditions
 * the rule does not carry are omitted, so an unconditional rule reads as such
 * instead of listing seven empty dimensions.
 */
export function formatSuppressionReason(
  suppression: Pick<Suppression, "name" | "kind" | "matcher">,
): string {
  const conditions = suppressionConditions(suppression.matcher);
  const scope =
    conditions.length === 0
      ? "matched no conditions (silences everything)"
      : `matched ${conditions.join(", ")}`;

  return `${SUPPRESSION_KIND_LABEL[suppression.kind]} 「${suppression.name}」 ${scope}`;
}

/**
 * Whether a matcher places no restriction on any dimension.
 *
 * Exported so the console can label a rule as "silences everything" from the
 * same condition list `formatSuppressionReason` renders; a new matcher
 * dimension then updates one place instead of two.
 */
export function isUnconditionalSuppressionMatcher(matcher: SuppressionMatcher): boolean {
  return suppressionConditions(matcher).length === 0;
}

function suppressionConditions(matcher: SuppressionMatcher): string[] {
  const conditions: string[] = [];

  if (matcher.sourceIds.length > 0) {
    conditions.push(`source in [${matcher.sourceIds.join(", ")}]`);
  }

  if (matcher.destinationIds.length > 0) {
    conditions.push(`destination in [${matcher.destinationIds.join(", ")}]`);
  }

  if (matcher.severities.length > 0) {
    conditions.push(`severity in [${matcher.severities.join(", ")}]`);
  }

  if (matcher.statuses.length > 0) {
    conditions.push(`status in [${matcher.statuses.join(", ")}]`);
  }

  for (const fingerprint of matcher.fingerprints) {
    conditions.push(`fingerprint ${fingerprint}`);
  }

  for (const label of matcher.labels) {
    conditions.push(
      label.operator === "equals"
        ? `label ${label.key}=${label.value}`
        : `label ${label.key} contains ${label.value}`,
    );
  }

  for (const needle of matcher.titleContains) {
    conditions.push(`title contains "${needle}"`);
  }

  for (const needle of matcher.messageContains) {
    conditions.push(`message contains "${needle}"`);
  }

  return conditions;
}
