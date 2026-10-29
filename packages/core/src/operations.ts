import { z } from "zod";

import { DeliveryStateSchema } from "#core/delivery/delivery";
import type { DeliveryJob, DeliveryState, ProviderReference } from "#core/delivery/delivery";
import type { DestinationKind, DestinationSummary } from "#core/destination/destination";
import type { EventRecord } from "#core/event/event";
import type { NormalizedEvent } from "#core/event/normalized-event";
import type { JsonObject, JsonValue } from "#core/json";
import type { OncallPing } from "#core/oncall/oncall";
import type {
  RouteDefinition,
  RouteMatchGap,
  RouteMatchProvenance,
  RouteMatchResult,
} from "#core/route/route";
import type { SourceSummary } from "#core/source/source";
import type { SuppressionKind } from "#core/suppression/suppression";

export type IsoDateTimeString = string;

/**
 * Relative windows the Events and Deliveries lists can be narrowed to.
 *
 * The window is resolved server-side against the request time, so the value
 * stays stable in the URL while the absolute lower bound moves forward on each
 * request. An empty value means "all time" and is not represented here.
 */
export const OperationTimeRangeSchema = z.enum(["15m", "1h", "6h", "24h", "7d"]);

export type OperationTimeRange = z.infer<typeof OperationTimeRangeSchema>;

/**
 * Upper bound for the exact `fingerprint` list filter.
 *
 * Fingerprints are provider-authored identifiers, so the real length belongs
 * to the upstream system. The bound only keeps a hand-edited URL or a pasted
 * value from becoming an unbounded SQL parameter; every observed provider
 * (Alertmanager's 16-char hex, Grafana's generator URL hash, and the generic
 * webhook contract) stays far below it.
 */
export const EVENT_FINGERPRINT_FILTER_MAX_LENGTH = 512;

/**
 * Narrows the events list by what the alert's fan-out produced.
 *
 * `none` is not a delivery state: it selects events that produced no delivery
 * at all, which is how an alert that never reached a destination shows up in
 * history (no route matched, or the matched route carried no destination).
 * Every other value means "at least one delivery is in this state", so the
 * filter answers "which alerts actually reached someone".
 */
export const EventDeliveryOutcomeSchema = z.union([z.literal("none"), DeliveryStateSchema]);

export type EventDeliveryOutcome = z.infer<typeof EventDeliveryOutcomeSchema>;

/**
 * Narrows the events list by whether the alert reached one destination.
 *
 * `delivered` means at least one delivery of the event targets the selected
 * destination — any state, including a silenced one, because the question is
 * "was this target covered", not "did the message arrive". `missing` is the
 * reverse, and it is the case no delivery-level filter can show: the alert
 * never reached that target, whether because no route matched, the route
 * carried a different target, or the target was disabled. Absence means "any",
 * like every other operation filter.
 */
export const EventDestinationMatchSchema = z.enum(["delivered", "missing"]);

export type EventDestinationMatch = z.infer<typeof EventDestinationMatchSchema>;

/**
 * Narrows the events list by the state of the delivery to one destination.
 *
 * Only meaningful together with `destinationId`: it answers "did this alert's
 * notification to that target succeed", which the event-level
 * `deliveryOutcome` cannot. That filter asks whether any delivery anywhere is
 * in the state, so pairing the two independent questions would return an alert
 * whose PagerDuty send failed whenever its email send succeeded. "No delivery
 * to that target" stays with `destinationMatch: "missing"`, so this dimension
 * has no `none` value.
 */
export const EventDestinationOutcomeSchema = DeliveryStateSchema;

export type EventDestinationOutcome = DeliveryState;

/**
 * Narrows the deliveries list by whether the target returned a message
 * reference.
 *
 * `present` means the target accepted the alert and identified the message, so
 * the operator can find it in the target system. `missing` covers everything
 * else: never attempted, attempted without a reference, silenced, or a legacy
 * row with only half of the reference written.
 */
export const DeliveryReceiptFilterSchema = z.enum(["present", "missing"]);

export type DeliveryReceiptFilter = z.infer<typeof DeliveryReceiptFilterSchema>;

/**
 * Which delivery timestamp the time window and the list order use.
 *
 * `created` is when the job was enqueued; `updated` is the last activity — a
 * retry, a state change, or the latest attempt. The list renders 更新时间, so
 * filtering by `created` hides a retried job from the window the operator is
 * looking at even though its visible timestamp falls inside it.
 */
export const DeliveryTimeFieldSchema = z.enum(["created", "updated"]);

export type DeliveryTimeField = z.infer<typeof DeliveryTimeFieldSchema>;

/**
 * Upper bound for the free-text operations search.
 *
 * The oRPC contract and the console URL normalizer share this value so a
 * pasted or hand-edited query is clipped before the server rejects it.
 */
export const OPERATION_SEARCH_MAX_LENGTH = 120;

/**
 * How many whitespace-separated terms the operations search actually applies.
 *
 * The search box is one field for titles, ids, labels, errors, and the other
 * columns each list searches. Splitting on whitespace lets an operator combine
 * an identity token with a text token (`node prod`) without remembering which
 * column each belongs to; the cap keeps a pasted log line from expanding into
 * an unbounded number of `LIKE` predicates. Terms past the cap are dropped, so
 * the console must say the results are broader than the query suggests.
 */
export const OPERATION_SEARCH_MAX_TERMS = 8;

export interface OperationSearchTerms {
  /** Terms that narrow the query, in the order the operator typed them. */
  terms: string[];
  /** Trailing terms the cap dropped; zero when every term applies. */
  ignoredCount: number;
}

/**
 * Splits the free-text operations search into the terms the query applies.
 *
 * Shared by the SQLite repository (which builds the predicates) and the
 * console (which warns when the cap drops terms), so the two cannot disagree
 * about how many terms are in effect.
 */
export function splitOperationSearchTerms(query: string): OperationSearchTerms {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter((term) => term.length > 0);
  const applied = terms.slice(0, OPERATION_SEARCH_MAX_TERMS);

  return { terms: applied, ignoredCount: terms.length - applied.length };
}

export interface NumberedPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Operations {
  events: NumberedPage<EventListItem>;
  deliveries: NumberedPage<DeliveryListItem>;
}

export interface EventListItem {
  id: string;
  sourceId: string;
  sourceName: string;
  severity: NormalizedEvent["severity"];
  status: NormalizedEvent["status"];
  title: string;
  fingerprint: string;
  receivedAt: IsoDateTimeString;
  routeMatchCount: number;
  deliveryCounts: Record<DeliveryState, number>;
  /**
   * True when the event is intake's audit row for a payload its provider
   * parser rejected. Those rows carry `unknown` severity and a generic title,
   * so without this flag the list looks like an upstream system sent an
   * unreadable alert rather than like Tocsin failed to parse a real one.
   */
  parseFailed: boolean;
}

export interface EventDetail {
  event: EventRecord;
  /**
   * True when the retention sweep replaced `event.rawPayload` and
   * `event.rawHeaders` with their cleared placeholders. The placeholders are a
   * persistence detail, not provider data, so the UI must explain the prune
   * instead of rendering them as JSON.
   */
  rawPayloadPruned: boolean;
  source: SourceSummary;
  routeMatches: RouteMatchResult[];
  /**
   * Whether `routeMatches` is the snapshot recorded at intake time or the result
   * of evaluating the *current* route definitions on read. Without it the two are
   * indistinguishable in the UI — see `docs/research/route-authoring-current-state.md` §4.2.
   */
  routeMatchesProvenance: RouteMatchProvenance;
  /**
   * Pairs the snapshot matched but which produced no delivery, with the reason
   * recoverable from records — or `unknown` when the records are gone. Empty is
   * the normal case.
   */
  routeMatchGaps: RouteMatchGap[];
  deliveries: EventDetailDelivery[];
}

export interface EventDetailDelivery extends DeliveryJob {
  destinationName: string;
  /**
   * Discriminates the destination's icon, like `DeliveryListItem.destinationKind`.
   * Optional so a detail projection written before this field existed still
   * parses; the UI falls back to a generic glyph.
   */
  destinationKind?: DestinationKind;
  routeName: string | null;
  /**
   * Target-system handle for the delivered message, for example a Feishu
   * `message_id`. The event detail table shows it so an operator can prove the
   * target accepted the alert without opening every delivery.
   */
  providerReference: ProviderReference | null;
  /**
   * HTTP status of the most recent completed attempt. `null` before the first
   * attempt finishes; a failed attempt keeps the status its target returned.
   */
  lastResponseStatus: number | null;
  /** When that attempt finished, so the receipt can be aged against the event. */
  lastResponseAt: IsoDateTimeString | null;
}

/**
 * One earlier event that carried the same fingerprint on the same source.
 *
 * The projection is deliberately narrow: a recurring alert is answered by
 * "when did it last fire, did it escalate, and did its text change", so the
 * occurrence carries the fields the change comparison needs and nothing from
 * the raw payload.
 */
export interface EventFingerprintOccurrence {
  id: string;
  severity: NormalizedEvent["severity"];
  status: NormalizedEvent["status"];
  /** Redacted with the same rules as the event detail projection. */
  title: string;
  receivedAt: IsoDateTimeString;
}

/**
 * Scalar fields compared between the current event and its previous
 * occurrence. `fingerprint`, `occurredAt` and the event id are ordered
 * differently by definition, so they are not part of the comparison.
 */
export const EVENT_FINGERPRINT_CHANGE_FIELDS = ["severity", "status", "title", "message"] as const;

export type EventFingerprintChangeField = (typeof EVENT_FINGERPRINT_CHANGE_FIELDS)[number];

export interface EventFingerprintFieldChange {
  field: EventFingerprintChangeField;
  /** Redacted previous value; severity/status stay machine values. */
  previous: string;
  current: string;
}

/** One label that appeared, disappeared, or changed value. */
export interface EventFingerprintLabelChange {
  key: string;
  /** `null` means the label was absent, not empty: the change is an addition. */
  previous: string | null;
  current: string | null;
}

/**
 * "Has this alert fired before, and what is different this time?"
 *
 * Same-source and exact-fingerprint only. A fingerprint is only meaningful
 * within the provider that produced it, so matching across sources would
 * merge unrelated alerts that happen to share a string.
 */
export interface EventFingerprintContext {
  fingerprint: string;
  /** How many earlier events carry the exact fingerprint on this source. */
  earlierCount: number;
  /** Most recent earlier occurrence, the baseline for the change lists. */
  previous: EventFingerprintOccurrence | null;
  /** Up to five most recent earlier occurrences, newest first. */
  recent: EventFingerprintOccurrence[];
  fieldChanges: EventFingerprintFieldChange[];
  labelChanges: EventFingerprintLabelChange[];
}

export interface DeliveryListItem {
  id: string;
  eventId: string;
  /**
   * Alert identity projected alongside the delivery so the list can answer
   * "which alert is this, and is it still firing?" without a second lookup.
   */
  eventTitle: string;
  eventSeverity: NormalizedEvent["severity"];
  eventStatus: NormalizedEvent["status"];
  sourceName: string;
  destinationName: string;
  /**
   * Discriminates the destination's icon. Optional so a persisted snapshot
   * written before this field existed still parses; the UI falls back to a
   * generic glyph rather than rendering nothing.
   */
  destinationKind?: DestinationKind;
  routeName: string | null;
  /**
   * Target-system handle for the delivered message, for example a Feishu
   * `message_id`. The list shows it so an operator can prove the target
   * accepted the alert without opening each job; `null` means no reference has
   * been recorded (yet, or at all).
   */
  providerReference: ProviderReference | null;
  state: DeliveryState;
  attemptCount: number;
  /**
   * The retry budget the job was created with. The list shows
   * `attemptCount / maxAttempts` so an operator can tell "will retry again"
   * from "gave up" without opening the delivery: `failed` with the budget
   * spent is final, while `pending` with a next attempt is still backing off.
   */
  maxAttempts: number;
  nextAttemptAt: IsoDateTimeString | null;
  lastError: string | null;
  /**
   * When the delivery was enqueued. The list sorts and filters on this column
   * by default, so the table must be able to show the same basis instead of
   * only the last activity time.
   */
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}

export interface DeliveryAttempt {
  id: string;
  deliveryId: string;
  attemptNumber: number;
  state: "running" | "succeeded" | "failed";
  responseStatus: number | null;
  responseBody: string | null;
  error: string | null;
  startedAt: IsoDateTimeString;
  finishedAt: IsoDateTimeString | null;
}

export interface DeliveryDetail {
  job: DeliveryJob;
  event: EventRecord;
  /**
   * True when the retention sweep replaced the event's `rawPayload` with its
   * cleared placeholder. The payload tab compares the raw event payload with
   * the rendered one, so the sentinel must surface as an explicit pruned state
   * instead of being rendered as if the upstream had sent it.
   */
  rawPayloadPruned: boolean;
  source: SourceSummary;
  destination: DestinationSummary;
  /**
   * `destinationMetadata` is projected from the destination as it exists at
   * read time, not from a snapshot taken at send time. This carries the
   * destination's last-write timestamp so the detail page can tell "this is
   * what the send used" apart from "this is what the target looks like today".
   */
  destinationUpdatedAt: IsoDateTimeString;
  destinationMetadata: JsonObject;
  route: RouteDefinition | null;
  renderedPayload: JsonValue | null;
  providerReference: ProviderReference | null;
  attempts: DeliveryAttempt[];
  /** Urgent phone pages created for this delivery, oldest first. */
  pings: OncallPing[];
}

export interface WorkerRunNotice {
  claimed: number;
  reclaimed: number;
  succeeded: number;
  failed: number;
  retrying: number;
  startedAt: IsoDateTimeString;
  finishedAt: IsoDateTimeString;
  /**
   * True when the run was skipped because outbound delivery is paused. Only
   * the delivery worker reports this; the on-call worker leaves it unset.
   */
  paused?: boolean;
  health?: WorkerHealthSnapshot;
  runnerHealth?: WorkerHealthSnapshot;
}

export interface WorkerHealthSnapshot {
  state: "idle" | "running" | "failed";
  lastStartedAt: IsoDateTimeString | null;
  lastFinishedAt: IsoDateTimeString | null;
  lastError: string | null;
  lastRun: Omit<WorkerRunNotice, "health" | "runnerHealth"> | null;
}

export const ReplayEventCommandSchema = z.object({
  eventId: z.string().min(1),
});
export type ReplayEventCommand = z.infer<typeof ReplayEventCommandSchema>;

export const PreviewRouteReplayCommandSchema = z.object({
  routeId: z.string().min(1),
  limit: z.number().int().min(1).max(100).default(20),
});
export type PreviewRouteReplayCommand = z.infer<typeof PreviewRouteReplayCommandSchema>;

export const ReplayRouteEventsCommandSchema = z.object({
  routeId: z.string().min(1),
  eventIds: z.array(z.string().min(1)).min(1).max(100),
});
export type ReplayRouteEventsCommand = z.infer<typeof ReplayRouteEventsCommandSchema>;

/** Result of manually paging one delivery: the records created by the attempt. */
export interface DeliveryPingsResult {
  deliveryId: string;
  pings: OncallPing[];
}

export interface EventReplayTarget {
  routeId: string;
  routeName: string;
  destinationId: string;
  deliveryId: string | null;
  alreadyExists: boolean;
}

export interface EventReplayPreview {
  eventId: string;
  routeMatches: RouteMatchResult[];
  targets: EventReplayTarget[];
  matchedRouteCount: number;
  newDeliveryCount: number;
  existingDeliveryCount: number;
  urgentPaging: UrgentPagingImpact;
}

/**
 * One destination whose deliveries would place automatic urgent phone calls.
 *
 * Replay and retry are both operator actions that can ring someone's phone, and
 * naming the destinations turns "N deliveries" into "these people are about to
 * be called" before the operator confirms.
 */
export interface UrgentPagingDestination {
  destinationId: string;
  destinationName: string;
  /** Receivers the destination would ring per delivery. */
  receiverCount: number;
}

/**
 * Read-only projection of the urgent calls an action can trigger.
 *
 * It answers "who could be phoned if these deliveries succeed". A delivery
 * still has to succeed and return a message reference before paging fires, and
 * the paging dedupe window can drop receivers, so `receiverCount` is an upper
 * bound rather than a promise. Disabled destinations and targets that already
 * have a delivery are excluded because neither can page.
 */
export interface UrgentPagingImpact {
  destinations: UrgentPagingDestination[];
  /** Deliveries that pass every automatic paging gate. */
  deliveryCount: number;
  /** Upper bound on calls: receivers per paging delivery, across destinations. */
  receiverCount: number;
}

/**
 * Whether an active suppression would swallow the retry.
 *
 * A retry only re-queues the job; the suppression decision is made again when
 * the worker claims it (`delivery.repository.ts` `claimNext`). An active rule
 * therefore turns the retry terminal — no attempt, no send, no phone call —
 * which the operator cannot see from the dialog otherwise.
 *
 * `unavailable` means the delivery's event row is gone, so the rule set cannot
 * be evaluated at all. Like the preview's other states it never blocks the
 * retry; it only refuses to answer "no rule matches" when that was not checked.
 */
export type DeliveryRetrySuppressionStatus = "matched" | "none" | "unavailable";

export interface DeliveryRetrySuppression {
  status: DeliveryRetrySuppressionStatus;
  /** The rule that would silence the retry, when `status` is `matched`. */
  suppressionId: string | null;
  suppressionName: string | null;
  suppressionKind: SuppressionKind | null;
  /**
   * When the matching window closes. The claim re-evaluates the clock, so a
   * retry confirmed after this instant is delivered normally.
   */
  endsAt: IsoDateTimeString | null;
}

/**
 * Who a successful retry of one failed delivery could phone.
 *
 * A retry re-queues the job and the worker's paging trigger fires on success,
 * so a deliberate resend carries the same irreversible side effect a replay
 * does. The preview keeps the replay's upper-bound semantics: the destination
 * and route must still be enabled, and the send still has to succeed before
 * anyone is called. A matched suppression empties the projection instead: the
 * claim marks the delivery suppressed before any send happens, so advertising
 * calls there would be as wrong as hiding them everywhere else.
 */
export interface DeliveryRetryPreview {
  deliveryId: string;
  urgentPaging: UrgentPagingImpact;
  suppression: DeliveryRetrySuppression;
}

export interface EventReplayResult extends EventReplayPreview {
  createdDeliveryIds: string[];
  skippedExistingCount: number;
}

export interface RouteReplayEventSummary {
  id: string;
  sourceId: string;
  sourceName: string;
  severity: NormalizedEvent["severity"];
  status: NormalizedEvent["status"];
  title: string;
  fingerprint: string;
  receivedAt: IsoDateTimeString;
}

export interface RouteReplayCandidate {
  event: RouteReplayEventSummary;
  targets: EventReplayTarget[];
  newDeliveryCount: number;
  existingDeliveryCount: number;
}

export interface RouteReplayPreview {
  routeId: string;
  routeName: string;
  enabled: boolean;
  limit: number;
  scannedEventCount: number;
  matchedEventCount: number;
  candidates: RouteReplayCandidate[];
  newDeliveryCount: number;
  existingDeliveryCount: number;
  /** Aggregate over every candidate; see `UrgentPagingImpact`. */
  urgentPaging: UrgentPagingImpact;
}

export interface RouteReplayResult {
  routeId: string;
  routeName: string;
  enabled: boolean;
  eventCount: number;
  createdDeliveryIds: string[];
  skippedExistingCount: number;
}

/**
 * What the delivery worker could claim on its next run.
 *
 * The predicate mirrors `claimNext`: pending rows whose destination and route
 * are enabled, whose retry backoff has elapsed, and which still have attempts
 * left. Claim-time suppression is decided after the claim query, so this is an
 * upper bound rather than a promise of delivery.
 */
export interface DeliveryBacklogSummary {
  claimable: number;
  oldestCreatedAt: IsoDateTimeString | null;
}
