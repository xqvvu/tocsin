import {
  AlertSeveritySchema,
  AlertStatusSchema,
  DeliveryAttemptResponseSchema,
  DeliveryAttemptStatusClassSchema,
  DeliveryJobSchema,
  DeliveryReceiptFilterSchema,
  DeliveryStateSchema,
  DeliveryTimeFieldSchema,
  DestinationKindSchema,
  EventDeliveryCoverageSchema,
  EventDeliveryOutcomeSchema,
  EventDestinationMatchSchema,
  EventDestinationOutcomeSchema,
  EVENT_FINGERPRINT_CHANGE_FIELDS,
  EVENT_FINGERPRINT_FILTER_MAX_LENGTH,
  DestinationSummarySchema,
  EventRecordSchema,
  IsoDateTimeSchema,
  JsonObjectSchema,
  JsonValueSchema,
  OncallPingSchema,
  OperationTimeRangeSchema,
  OPERATION_SEARCH_MAX_LENGTH,
  PreviewRouteReplayCommandSchema,
  ProviderReferenceSchema,
  ReplayEventCommandSchema,
  ReplayRouteEventsCommandSchema,
  RouteDefinitionSchema,
  RouteMatchProvenanceSchema,
  RouteMatchGapSchema,
  RouteMatchResultSchema,
  SourceSummarySchema,
  SuppressionKindSchema,
} from "@tocsin/core";
import * as z from "zod";

import { NumberedPageSchema } from "./shared";

/**
 * Event and delivery operations contract.
 *
 * These schemas mirror the read projections in `@tocsin/core` operations types.
 * Every payload stays redaction-safe: raw provider payloads are represented as
 * JSON values, and destination metadata is built from operational config only.
 */

export const EventListItemSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  sourceName: z.string().min(1),
  severity: AlertSeveritySchema,
  status: AlertStatusSchema,
  title: z.string(),
  fingerprint: z.string(),
  receivedAt: IsoDateTimeSchema,
  routeMatchCount: z.number().int().min(0),
  // The history projection always emits all four delivery states.
  deliveryCounts: z.record(DeliveryStateSchema, z.number().int().min(0)),
  // Intake's audit rows for payloads a provider parser rejected. Derived from
  // provider metadata on read; old rows without the marker project as false.
  parseFailed: z.boolean(),
});

export const EventDetailDeliverySchema = DeliveryJobSchema.extend({
  destinationName: z.string().min(1),
  // Optional for the same reason as the core interface: snapshots persisted
  // before this field existed must still parse.
  destinationKind: DestinationKindSchema.optional(),
  routeName: z.string().min(1).nullable(),
  // Receipt facts carried from the delivery row and its latest completed
  // attempt, so the event detail table can show that the target accepted the
  // alert without opening each delivery.
  providerReference: ProviderReferenceSchema.nullable(),
  lastResponseStatus: z.number().int().nullable(),
  lastResponseAt: IsoDateTimeSchema.nullable(),
});

export const EventDetailSchema = z.object({
  event: EventRecordSchema,
  /**
   * Derived from the retention prune sentinel so the UI can explain a cleared
   * payload instead of rendering the sentinel as provider data.
   */
  rawPayloadPruned: z.boolean(),
  source: SourceSummarySchema,
  routeMatches: z.array(RouteMatchResultSchema),
  routeMatchesProvenance: RouteMatchProvenanceSchema,
  /**
   * Pairs the snapshot says matched but which produced no delivery, each with
   * the reason recoverable from records — or `unknown` when the records needed
   * have been pruned. Empty is the normal, healthy case.
   */
  routeMatchGaps: z.array(RouteMatchGapSchema),
  deliveries: z.array(EventDetailDeliverySchema),
});

export const EventFingerprintOccurrenceSchema = z.object({
  id: z.string().min(1),
  severity: AlertSeveritySchema,
  status: AlertStatusSchema,
  title: z.string(),
  receivedAt: IsoDateTimeSchema,
});

export const EventFingerprintFieldChangeSchema = z.object({
  // Mirrors `EVENT_FINGERPRINT_CHANGE_FIELDS`; the const array is the single
  // source the service and its tests iterate.
  field: z.enum(EVENT_FINGERPRINT_CHANGE_FIELDS),
  previous: z.string(),
  current: z.string(),
});

export const EventFingerprintLabelChangeSchema = z.object({
  key: z.string().min(1),
  previous: z.string().nullable(),
  current: z.string().nullable(),
});

export const EventFingerprintContextSchema = z.object({
  fingerprint: z.string(),
  earlierCount: z.number().int().min(0),
  previous: EventFingerprintOccurrenceSchema.nullable(),
  recent: z.array(EventFingerprintOccurrenceSchema),
  fieldChanges: z.array(EventFingerprintFieldChangeSchema),
  labelChanges: z.array(EventFingerprintLabelChangeSchema),
});

export const DeliveryListItemSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  // Alert identity is part of the list projection: the join already exists in
  // `listDeliveries`, so carrying these fields costs no extra query.
  eventTitle: z.string(),
  eventSeverity: AlertSeveritySchema,
  eventStatus: AlertStatusSchema,
  sourceName: z.string().min(1),
  destinationName: z.string().min(1),
  // Optional for the same reason as the core interface: rows read back from
  // snapshots written before this field existed must still parse.
  destinationKind: DestinationKindSchema.optional(),
  routeName: z.string().min(1).nullable(),
  // An operational identifier, never a secret: the same value the delivery
  // detail page exposes.
  providerReference: ProviderReferenceSchema.nullable(),
  state: DeliveryStateSchema,
  attemptCount: z.number().int().min(0),
  // The retry budget, so the list can render `attemptCount / maxAttempts` and
  // an operator can tell "backing off" from "out of retries" at a glance.
  maxAttempts: z.number().int().min(1),
  nextAttemptAt: IsoDateTimeSchema.nullable(),
  lastError: z.string().nullable(),
  // The default list basis. Without it the table can only show `updatedAt`
  // while the rows are ordered by `createdAt`.
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const DeliveryAttemptSchema = z.object({
  id: z.string().min(1),
  deliveryId: z.string().min(1),
  attemptNumber: z.number().int().min(0),
  state: z.enum(["running", "succeeded", "failed"]),
  responseStatus: z.number().int().nullable(),
  responseBody: z.string().nullable(),
  error: z.string().nullable(),
  startedAt: IsoDateTimeSchema,
  finishedAt: IsoDateTimeSchema.nullable(),
});

export const DeliveryDetailSchema = z.object({
  job: DeliveryJobSchema,
  event: EventRecordSchema,
  // The retention sweep leaves a sentinel behind; the UI needs the explicit
  // state to avoid rendering it as provider data.
  rawPayloadPruned: z.boolean(),
  source: SourceSummarySchema,
  destination: DestinationSummarySchema,
  // Last write to the target's stored config. The metadata below is projected
  // at read time, so this is how the UI spots a target changed after the send.
  destinationUpdatedAt: IsoDateTimeSchema,
  // Operational destination facts only: template mode, endpoint, method, and
  // header names. Signing secrets never reach this projection.
  destinationMetadata: JsonObjectSchema,
  route: RouteDefinitionSchema.nullable(),
  renderedPayload: JsonValueSchema.nullable(),
  // Target-system handle for the delivered message, for example a Feishu
  // message_id. An operational identifier, never a secret.
  providerReference: ProviderReferenceSchema.nullable(),
  attempts: z.array(DeliveryAttemptSchema),
  // Urgent phone pages created for this delivery; a failed page never changes
  // the delivery's own state.
  pings: z.array(OncallPingSchema),
});

export const BuzzDeliveryOutputSchema = z.object({
  deliveryId: z.string().min(1),
  pings: z.array(OncallPingSchema),
});

export const EventReplayTargetSchema = z.object({
  routeId: z.string().min(1),
  routeName: z.string().min(1),
  destinationId: z.string().min(1),
  deliveryId: z.string().min(1).nullable(),
  alreadyExists: z.boolean(),
});

export const UrgentPagingDestinationSchema = z.object({
  destinationId: z.string().min(1),
  destinationName: z.string().min(1),
  receiverCount: z.number().int().min(1),
});

export const UrgentPagingImpactSchema = z.object({
  destinations: z.array(UrgentPagingDestinationSchema),
  deliveryCount: z.number().int().min(0),
  receiverCount: z.number().int().min(0),
});

export const DeliveryRetrySuppressionSchema = z.object({
  status: z.enum(["matched", "none", "unavailable"]),
  suppressionId: z.string().min(1).nullable(),
  suppressionName: z.string().min(1).nullable(),
  suppressionKind: SuppressionKindSchema.nullable(),
  endsAt: IsoDateTimeSchema.nullable(),
});

export const DeliveryRetryPreviewSchema = z.object({
  deliveryId: z.string().min(1),
  urgentPaging: UrgentPagingImpactSchema,
  suppression: DeliveryRetrySuppressionSchema,
});

export const EventReplayPreviewSchema = z.object({
  eventId: z.string().min(1),
  routeMatches: z.array(RouteMatchResultSchema),
  targets: z.array(EventReplayTargetSchema),
  matchedRouteCount: z.number().int().min(0),
  newDeliveryCount: z.number().int().min(0),
  existingDeliveryCount: z.number().int().min(0),
  urgentPaging: UrgentPagingImpactSchema,
});

export const EventReplayResultSchema = EventReplayPreviewSchema.extend({
  createdDeliveryIds: z.array(z.string().min(1)),
  skippedExistingCount: z.number().int().min(0),
});

export const RouteReplayEventSummarySchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  sourceName: z.string().min(1),
  severity: AlertSeveritySchema,
  status: AlertStatusSchema,
  title: z.string(),
  fingerprint: z.string(),
  receivedAt: IsoDateTimeSchema,
});

export const RouteReplayCandidateSchema = z.object({
  event: RouteReplayEventSummarySchema,
  targets: z.array(EventReplayTargetSchema),
  newDeliveryCount: z.number().int().min(0),
  existingDeliveryCount: z.number().int().min(0),
});

export const RouteReplayPreviewSchema = z.object({
  routeId: z.string().min(1),
  routeName: z.string().min(1),
  enabled: z.boolean(),
  limit: z.number().int().min(1),
  scannedEventCount: z.number().int().min(0),
  matchedEventCount: z.number().int().min(0),
  candidates: z.array(RouteReplayCandidateSchema),
  newDeliveryCount: z.number().int().min(0),
  existingDeliveryCount: z.number().int().min(0),
  urgentPaging: UrgentPagingImpactSchema,
});

export const RouteReplayResultSchema = z.object({
  routeId: z.string().min(1),
  routeName: z.string().min(1),
  enabled: z.boolean(),
  eventCount: z.number().int().min(0),
  createdDeliveryIds: z.array(z.string().min(1)),
  skippedExistingCount: z.number().int().min(0),
});

/** Combined events and deliveries page behind the operations workspace. */
export const OperationsOutputSchema = z.object({
  events: NumberedPageSchema(EventListItemSchema),
  deliveries: NumberedPageSchema(DeliveryListItemSchema),
});

/**
 * Read-only projection of the queue the worker would claim next.
 *
 * `oldestCreatedAt` is null exactly when `claimable` is 0; the pair lets the
 * paused banner say how much is waiting and for how long.
 */
export const DeliveryBacklogSummarySchema = z.object({
  claimable: z.number().int().min(0),
  oldestCreatedAt: IsoDateTimeSchema.nullable(),
});

export const ListOperationsInputSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(20),
    sourceId: z.string().min(1).optional(),
    /**
     * One severity or several. The console's filter offers a multi-select; a
     * single value stays valid so links written before it, and API callers
     * that pass one value, keep working unchanged.
     */
    severity: z.union([AlertSeveritySchema, z.array(AlertSeveritySchema).min(1).max(4)]).optional(),
    status: z.union([AlertStatusSchema, z.array(AlertStatusSchema).min(1).max(3)]).optional(),
    destinationId: z.string().min(1).optional(),
    /**
     * Events-only: whether the alert reached the selected `destinationId`
     * (`delivered`, the default) or never produced a delivery to it
     * (`missing`). Ignored without `destinationId`, and by the delivery list,
     * which already has the exact `deliveryState` dimension.
     */
    destinationMatch: EventDestinationMatchSchema.optional(),
    /**
     * Events-only: the state of the delivery to the selected `destinationId`,
     * so "the pager send failed" cannot be satisfied by a successful send to
     * another target. Ignored without `destinationId`; missing coverage stays
     * with `destinationMatch`, so there is no `none` value here.
     */
    destinationOutcome: EventDestinationOutcomeSchema.optional(),
    /**
     * Restricts the events list to alerts whose fan-out produced no delivery
     * (`none`) or at least one delivery in the given state. Ignored by the
     * delivery list, which has the exact `deliveryState` dimension instead.
     */
    deliveryOutcome: EventDeliveryOutcomeSchema.optional(),
    /**
     * Events-only: how much of the fan-out reached a target. `all` keeps events
     * whose every delivery succeeded, `partial` events where some did and some
     * did not, and `none` events that produced deliveries but none succeeded.
     * Events without any delivery are outside this facet; `deliveryOutcome`
     * selects them. Ignored by the delivery list.
     */
    deliveryCoverage: EventDeliveryCoverageSchema.optional(),
    /**
     * Events-only: whether intake's provider parser rejected the webhook
     * payload. A rejected payload is still recorded as an event so the raw body
     * can be inspected, but it never produced a route match or a delivery, so
     * the list could not tell it apart from "no route matched". `false` also
     * covers rows whose provider metadata cannot be read, matching the
     * projection's tolerant `parseFailed` flag. Ignored by the delivery list.
     */
    parseFailed: z.boolean().optional(),
    /** Restricts the delivery list to one destination adapter kind. */
    destinationKind: DestinationKindSchema.optional(),
    /** Restricts the delivery list to one route; manual deliveries have none. */
    routeId: z.string().min(1).optional(),
    /**
     * Delivery-only: restricts the list to the deliveries fanned out from one
     * event. The events table links each count badge here, so an operator can
     * move from "this alert produced 3 failed deliveries" to the exact rows.
     */
    eventId: z.string().min(1).optional(),
    /**
     * Delivery-only: only jobs whose target returned (or did not return) a
     * message reference.
     */
    receipt: DeliveryReceiptFilterSchema.optional(),
    /**
     * Delivery-only: one state or several. "pending or failed" is one list,
     * not two passes over the same rows.
     */
    deliveryState: z
      .union([DeliveryStateSchema, z.array(DeliveryStateSchema).min(1).max(5)])
      .optional(),
    /**
     * Delivery-only lower bound on `attempt_count`. Lets an operator isolate
     * jobs that were retried instead of reading the attempt column row by row.
     */
    minAttempts: z.number().int().min(1).max(100).optional(),
    /**
     * Delivery-only: the HTTP status class returned by the latest completed
     * attempt. Separates a misconfigured target (4xx) from an unhealthy one
     * (5xx) without reading each row's free-text error, and ignores attempts
     * that never received a response.
     */
    lastAttemptStatusClass: DeliveryAttemptStatusClassSchema.optional(),
    /**
     * Delivery-only: whether the latest completed attempt received an HTTP
     * response. Complements the status class, which can only describe attempts
     * the target answered; `missing` is the timeout, DNS, and TLS case.
     */
    lastAttemptResponse: DeliveryAttemptResponseSchema.optional(),
    /** Relative window resolved against the server's request time. */
    range: OperationTimeRangeSchema.optional(),
    /**
     * Instant the operator opened the window. Pins the lower bound so paging
     * and shared links describe the same window instead of one that slides
     * forward on every request. Ignored without `range`.
     */
    rangeAnchor: IsoDateTimeSchema.optional(),
    /**
     * Exclusive upper bound on the list's time column, captured when the
     * operator starts paging. Both lists are offset-paginated, so an alert
     * that arrives between page requests shifts every later row down and
     * makes the next page repeat a row the reader already saw. Freezing the
     * upper edge once keeps the result set still for the rest of the walk.
     */
    rangeUntil: IsoDateTimeSchema.optional(),
    /**
     * Delivery-only: which timestamp `range` compares against and which one
     * the list is ordered by. `created` (the default) is enqueue time;
     * `updated` is the last activity, so a retried job stays inside the window
     * that its visible 更新时间 belongs to.
     */
    timeField: DeliveryTimeFieldSchema.optional(),
    q: z.string().trim().min(1).max(OPERATION_SEARCH_MAX_LENGTH).optional(),
    /**
     * Both lists: one exact `events.fingerprint`. The search box matches the
     * fingerprint as one substring among many fields, so it also returns rows
     * whose text merely contains the same characters; this dimension answers
     * "every occurrence of exactly this alert" on the events list and "every
     * notification it ever sent" on the delivery list.
     */
    fingerprint: z.string().trim().min(1).max(EVENT_FINGERPRINT_FILTER_MAX_LENGTH).optional(),
    eventPage: z.number().int().min(1).default(1),
    deliveryPage: z.number().int().min(1).default(1),
  })
  .optional();

export const OperationDetailInputSchema = z.object({
  id: z.string().min(1),
});

export const RunDeliveryWorkerInputSchema = z
  .object({
    limit: z.number().int().min(1).max(50).default(10),
  })
  .optional();

export const ReplayEventInputSchema = ReplayEventCommandSchema;
export const PreviewRouteReplayInputSchema = PreviewRouteReplayCommandSchema;
export const ReplayRouteEventsInputSchema = ReplayRouteEventsCommandSchema;

/** A retry reschedules the job and returns the updated delivery job. */
export const RetryDeliveryOutputSchema = DeliveryJobSchema;
