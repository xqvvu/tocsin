import {
  AlertSeveritySchema,
  AlertStatusSchema,
  DeliveryJobSchema,
  DeliveryStateSchema,
  DestinationSummarySchema,
  EventRecordSchema,
  IsoDateTimeSchema,
  JsonObjectSchema,
  JsonValueSchema,
  OncallPingSchema,
  PreviewRouteReplayCommandSchema,
  ProviderReferenceSchema,
  ReplayEventCommandSchema,
  ReplayRouteEventsCommandSchema,
  RouteDefinitionSchema,
  RouteMatchProvenanceSchema,
  RouteMatchResultSchema,
  SourceSummarySchema,
} from "@tocsin/core";
import * as z from "zod";

import { NumberedPageSchema, PageSchema } from "./shared";

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
});

export const EventDetailDeliverySchema = DeliveryJobSchema.extend({
  destinationName: z.string().min(1),
  routeName: z.string().min(1).nullable(),
});

export const EventDetailSchema = z.object({
  event: EventRecordSchema,
  source: SourceSummarySchema,
  routeMatches: z.array(RouteMatchResultSchema),
  routeMatchesProvenance: RouteMatchProvenanceSchema,
  deliveries: z.array(EventDetailDeliverySchema),
});

export const DeliveryListItemSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  sourceName: z.string().min(1),
  destinationName: z.string().min(1),
  routeName: z.string().min(1).nullable(),
  state: DeliveryStateSchema,
  attemptCount: z.number().int().min(0),
  nextAttemptAt: IsoDateTimeSchema.nullable(),
  lastError: z.string().nullable(),
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
  source: SourceSummarySchema,
  destination: DestinationSummarySchema,
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

export const EventReplayPreviewSchema = z.object({
  eventId: z.string().min(1),
  routeMatches: z.array(RouteMatchResultSchema),
  targets: z.array(EventReplayTargetSchema),
  matchedRouteCount: z.number().int().min(0),
  newDeliveryCount: z.number().int().min(0),
  existingDeliveryCount: z.number().int().min(0),
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
  deliveries: PageSchema(DeliveryListItemSchema),
});

export const ListOperationsInputSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(20),
    sourceId: z.string().min(1).optional(),
    severity: AlertSeveritySchema.optional(),
    status: AlertStatusSchema.optional(),
    destinationId: z.string().min(1).optional(),
    deliveryState: DeliveryStateSchema.optional(),
    q: z.string().trim().min(1).max(120).optional(),
    eventPage: z.number().int().min(1).default(1),
    deliveryCursor: z.string().min(1).optional(),
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
