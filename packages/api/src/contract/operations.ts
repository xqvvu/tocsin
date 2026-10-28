import { oc } from "@orpc/contract";
import { ReplayEventCommandSchema } from "@tocsin/core";

import { dashboardAuth } from "../errors/dashboard-auth";
import { resourceErrors } from "../errors/resources";
import {
  BuzzDeliveryOutputSchema,
  DeliveryBacklogSummarySchema,
  DeliveryDetailSchema,
  DeliveryRetryPreviewSchema,
  EventReplayPreviewSchema,
  EventReplayResultSchema,
  EventDetailSchema,
  EventFingerprintContextSchema,
  ListOperationsInputSchema,
  OperationDetailInputSchema,
  OperationsOutputSchema,
  PreviewRouteReplayInputSchema,
  ReplayEventInputSchema,
  ReplayRouteEventsInputSchema,
  RetryDeliveryOutputSchema,
  RouteReplayPreviewSchema,
  RouteReplayResultSchema,
  RunDeliveryWorkerInputSchema,
} from "../schemas/operations";
import { RunDeliveryWorkerOutputSchema } from "../schemas/worker";

const dashboardErrors = dashboardAuth.error;
const resource = resourceErrors.error;

/**
 * Event, delivery, and replay operations.
 *
 * Replays and the manual worker run are the only write procedures here; every
 * read stays redaction-safe (JSON payloads and operational destination facts
 * only). The replay services return `null` when the target no longer exists, so
 * those outputs are nullable instead of raising NOT_FOUND.
 */
export const operations = {
  list: oc.input(ListOperationsInputSchema).errors(dashboardErrors).output(OperationsOutputSchema),

  getEventDetail: oc
    .input(OperationDetailInputSchema)
    .errors(dashboardErrors)
    .output(EventDetailSchema.nullable()),

  /**
   * Earlier occurrences of the same fingerprint on the same source, plus what
   * changed since the most recent one. Read-only and scoped to one event: the
   * aggregate view stays a separate concern.
   */
  getEventFingerprintContext: oc
    .input(OperationDetailInputSchema)
    .errors(dashboardErrors)
    .output(EventFingerprintContextSchema.nullable()),

  getDeliveryDetail: oc
    .input(OperationDetailInputSchema)
    .errors(dashboardErrors)
    .output(DeliveryDetailSchema.nullable()),

  /**
   * Read-only queue projection for the paused banner: how many deliveries the
   * worker would claim next and when the oldest of them was created.
   */
  getDeliveryBacklog: oc.errors(dashboardErrors).output(DeliveryBacklogSummarySchema),

  /**
   * Read-only: who a successful retry of this delivery could phone. Null when
   * the delivery no longer exists, matching the replay previews.
   */
  previewDeliveryRetry: oc
    .input(OperationDetailInputSchema)
    .errors(dashboardErrors)
    .output(DeliveryRetryPreviewSchema.nullable()),

  retryDelivery: oc
    .input(OperationDetailInputSchema)
    .errors(dashboardErrors)
    .errors(resource)
    .output(RetryDeliveryOutputSchema),

  // Manual urgent paging for one delivery: calls the destination's configured
  // receivers and records the operator. BAD_REQUEST carries the readable reason
  // when the delivery has no message reference or no receivers are configured.
  buzzDelivery: oc
    .input(OperationDetailInputSchema)
    .errors(dashboardErrors)
    .errors(resource)
    .output(BuzzDeliveryOutputSchema),

  previewEventReplay: oc
    .input(ReplayEventInputSchema)
    .errors(dashboardErrors)
    .output(EventReplayPreviewSchema.nullable()),

  replayEvent: oc
    .input(ReplayEventCommandSchema)
    .errors(dashboardErrors)
    .output(EventReplayResultSchema.nullable()),

  previewRouteReplay: oc
    .input(PreviewRouteReplayInputSchema)
    .errors(dashboardErrors)
    .output(RouteReplayPreviewSchema.nullable()),

  replayRouteEvents: oc
    .input(ReplayRouteEventsInputSchema)
    .errors(dashboardErrors)
    .output(RouteReplayResultSchema.nullable()),

  runDeliveryWorker: oc
    .input(RunDeliveryWorkerInputSchema)
    .errors(dashboardErrors)
    .output(RunDeliveryWorkerOutputSchema),
};
