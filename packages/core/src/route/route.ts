import { z } from "zod";

import {
  AlertSeveritySchema,
  AlertStatusSchema,
  NormalizedEventSchema,
} from "#core/event/normalized-event";
import type { Labels, NormalizedEvent } from "#core/event/normalized-event";

export const LabelMatchOperatorSchema = z.enum(["equals", "contains"]);
const NonEmptyRouteStringSchema = z.string().trim().min(1);

export const LabelMatcherSchema = z.strictObject({
  key: NonEmptyRouteStringSchema,
  operator: LabelMatchOperatorSchema.default("equals"),
  value: NonEmptyRouteStringSchema,
});

export const RouteRuleSchema = z.strictObject({
  sourceIds: z.array(NonEmptyRouteStringSchema).default([]),
  severities: z.array(AlertSeveritySchema).default([]),
  statuses: z.array(AlertStatusSchema).default([]),
  labels: z.array(LabelMatcherSchema).default([]),
  titleContains: z.array(NonEmptyRouteStringSchema).default([]),
  messageContains: z.array(NonEmptyRouteStringSchema).default([]),
});

const EmptyRouteRule = {
  sourceIds: [],
  severities: [],
  statuses: [],
  labels: [],
  titleContains: [],
  messageContains: [],
} satisfies z.output<typeof RouteRuleSchema>;

export const RouteDefinitionSchema = z.object({
  id: NonEmptyRouteStringSchema,
  name: z.string().trim().min(1),
  enabled: z.boolean().default(true),
  rule: RouteRuleSchema.default(EmptyRouteRule),
  destinationIds: z
    .array(NonEmptyRouteStringSchema)
    .min(1)
    .refine((destinationIds) => new Set(destinationIds).size === destinationIds.length, {
      message: "Route destination IDs must be unique",
    }),
});

export const RouteMatchInputSchema = z.object({
  sourceId: NonEmptyRouteStringSchema,
  event: NormalizedEventSchema,
});

export const RouteMatchCheckSchema = z.object({
  field: z.enum([
    "enabled",
    "source",
    "severity",
    "status",
    "label",
    "title",
    "message",
    // Suppression-only dimensions. They share this schema because a suppression
    // renders its evidence with the same component as a route match.
    "destination",
    "fingerprint",
  ]),
  matched: z.boolean(),
  detail: z.string(),
  /**
   * Structured form of the comparison, so the console can render the evidence
   * in the operator's language instead of the English string built here —
   * and so it can show the event's *actual* value next to the expected one
   * without the operator switching to the normalized tab.
   *
   * `condition: "none"` means the rule carries no condition for this field
   * (which matches everything). When `condition` is absent entirely the check
   * predates this field: those snapshots are immutable, so the console falls
   * back to rendering `detail` verbatim.
   */
  condition: z.enum(["none", "compare"]).optional(),
  /** Expected values, in the rule's own order. */
  expected: z.array(z.string()).optional(),
  /** The event value the condition was applied to; absent when the event lacks it. */
  actual: z.string().optional(),
  /** Label key, only set for `field: "label"` comparisons. */
  labelKey: z.string().optional(),
});

/**
 * Where the route-match evidence on an event came from.
 *
 * `intake_snapshot` — recorded when the event was ingested, and never rewritten,
 * so it reflects the route definitions in force at that moment.
 * `recomputed` — the event had no snapshot, so the current route definitions were
 * evaluated on read. The two look identical without this marker.
 */
export const RouteMatchProvenanceSchema = z.enum(["intake_snapshot", "recomputed"]);

export const RouteMatchResultSchema = z.object({
  routeId: NonEmptyRouteStringSchema,
  routeName: z.string().trim().min(1),
  matched: z.boolean(),
  destinationIds: z.array(NonEmptyRouteStringSchema),
  checks: z.array(RouteMatchCheckSchema),
});

export const RouteMatchResultsSchema = z.array(RouteMatchResultSchema);

export type LabelMatcher = z.infer<typeof LabelMatcherSchema>;
export type RouteRule = z.output<typeof RouteRuleSchema>;
export type RouteRuleInput = z.input<typeof RouteRuleSchema>;
export type RouteDefinition = z.output<typeof RouteDefinitionSchema>;
export type RouteDefinitionInput = z.input<typeof RouteDefinitionSchema>;
export type RouteMatchInput = z.infer<typeof RouteMatchInputSchema>;
export type RouteMatchCheck = z.infer<typeof RouteMatchCheckSchema>;
export type RouteMatchProvenance = z.infer<typeof RouteMatchProvenanceSchema>;
export type RouteMatchResult = z.infer<typeof RouteMatchResultSchema>;

export function evaluateRouteMatch(
  routeInput: RouteDefinitionInput,
  input: RouteMatchInput,
): RouteMatchResult {
  const route = RouteDefinitionSchema.parse(routeInput);
  const checks: RouteMatchCheck[] = [];

  if (!route.enabled) {
    checks.push({
      field: "enabled",
      matched: false,
      detail: "Route is disabled",
      condition: "none",
    });
    return resultFor(route, checks);
  }

  checks.push({ field: "enabled", matched: true, detail: "Route is enabled", condition: "none" });
  evaluateSource(route.rule.sourceIds, input.sourceId, checks);
  evaluateOneOf("severity", route.rule.severities, input.event.severity, checks);
  evaluateOneOf("status", route.rule.statuses, input.event.status, checks);
  evaluateLabels(route.rule.labels, input.event, checks);
  evaluateContainsAll("title", route.rule.titleContains, input.event.title, checks);
  evaluateContainsAll("message", route.rule.messageContains, input.event.message, checks);

  return resultFor(route, checks);
}

export function routeMatchesEvent(route: RouteDefinitionInput, input: RouteMatchInput): boolean {
  return evaluateRouteMatch(route, input).matched;
}

export function findMatchingRoutes(
  routes: RouteDefinitionInput[],
  input: RouteMatchInput,
): RouteMatchResult[] {
  return routes.map((route) => evaluateRouteMatch(route, input)).filter((result) => result.matched);
}

function resultFor(route: RouteDefinition, checks: RouteMatchCheck[]): RouteMatchResult {
  return {
    routeId: route.id,
    routeName: route.name,
    matched: checks.every((check) => check.matched),
    destinationIds: route.destinationIds,
    checks,
  };
}

export function evaluateSource(
  expectedSourceIds: string[],
  actualSourceId: string,
  checks: RouteMatchCheck[],
): void {
  if (expectedSourceIds.length === 0) {
    checks.push({
      field: "source",
      matched: true,
      detail: "No source condition",
      condition: "none",
    });
    return;
  }

  checks.push({
    field: "source",
    matched: expectedSourceIds.includes(actualSourceId),
    detail: `Expected one of ${expectedSourceIds.join(", ")}, received ${actualSourceId}`,
    condition: "compare",
    expected: expectedSourceIds,
    actual: actualSourceId,
  });
}

export function evaluateOneOf(
  field: "severity" | "status",
  expected: string[],
  actual: string,
  checks: RouteMatchCheck[],
): void {
  if (expected.length === 0) {
    checks.push({ field, matched: true, detail: `No ${field} condition`, condition: "none" });
    return;
  }

  checks.push({
    field,
    matched: expected.includes(actual),
    detail: `Expected one of ${expected.join(", ")}, received ${actual}`,
    condition: "compare",
    expected,
    actual,
  });
}

/**
 * Only `labels` is read, so the parameter is narrowed to that: a suppression
 * evaluates the same comparison against a partial event view (it has no
 * `occurredAt` at delivery claim time), and widening the type to NormalizedEvent
 * would force an unsafe cast at that call site.
 */
export function evaluateLabels(
  matchers: LabelMatcher[],
  event: { labels: Labels },
  checks: RouteMatchCheck[],
): void {
  if (matchers.length === 0) {
    checks.push({ field: "label", matched: true, detail: "No label condition", condition: "none" });
    return;
  }

  for (const matcher of matchers) {
    const actualValue = event.labels[matcher.key];
    const matched =
      matcher.operator === "equals"
        ? actualValue === matcher.value
        : typeof actualValue === "string" && actualValue.includes(matcher.value);

    checks.push({
      field: "label",
      matched,
      detail: `Expected label ${matcher.key} ${matcher.operator} ${matcher.value}`,
      condition: "compare",
      expected: [matcher.value],
      // Absent when the event does not carry this label at all — which is the
      // single most common reason a label condition misses.
      ...(actualValue === undefined ? {} : { actual: actualValue }),
      labelKey: matcher.key,
    });
  }
}

export function evaluateContainsAll(
  field: "title" | "message",
  expectedNeedles: string[],
  actualHaystack: string,
  checks: RouteMatchCheck[],
): void {
  if (expectedNeedles.length === 0) {
    checks.push({ field, matched: true, detail: `No ${field} condition`, condition: "none" });
    return;
  }

  const normalizedHaystack = actualHaystack.toLocaleLowerCase();

  for (const needle of expectedNeedles) {
    checks.push({
      field,
      matched: normalizedHaystack.includes(needle.toLocaleLowerCase()),
      detail: `Expected ${field} to contain ${needle}`,
      condition: "compare",
      expected: [needle],
      actual: actualHaystack,
    });
  }
}
