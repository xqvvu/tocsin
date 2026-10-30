import type {
  DeliveryBacklogSummary,
  DeliveryDetail,
  DeliveryJob,
  DeliveryPingsResult,
  DeliveryRetryPreview,
  DeliveryRetrySuppression,
  DeliveryRetrySuppressionStatus,
  EventFingerprintContext,
  EventRecord,
  OperationTimeRange,
  UrgentPagingImpact,
} from "@tocsin/core";
import { selectSuppressionForDelivery } from "@tocsin/core";
import { feishuUrgentPagingReceivers } from "@tocsin/destinations/feishu";

import type { DestinationRuntimeConfig } from "#/infra/sqlite/repositories/destination/destination.interface";
import type {
  ListOperationsInput,
  OperationsList,
  OperationsServiceOptions,
} from "#/server/operations/operations.service.types";

const TIME_RANGE_MS: Record<OperationTimeRange, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export class OperationsService {
  private readonly store: OperationsServiceOptions["store"];
  private readonly oncall: OperationsServiceOptions["oncall"];
  private readonly now: () => Date;

  constructor(options: OperationsServiceOptions) {
    this.store = options.store;
    this.oncall = options.oncall;
    this.now = options.now ?? (() => new Date());
  }

  async listOperations(input: ListOperationsInput = {}): Promise<OperationsList> {
    const limit = input.limit ?? 20;
    const since = timeRangeSince(input.range, this.now(), input.rangeAnchor);
    const [events, deliveries] = await Promise.all([
      this.store.history.listEvents({
        limit,
        sourceId: input.sourceId,
        severity: input.severity,
        status: input.status,
        // Events-only: answers "did this alert reach anyone". The delivery
        // list keeps its exact `deliveryState` dimension instead.
        deliveryOutcome: input.deliveryOutcome,
        // Events-only: a rejected payload is stored as an event with no
        // deliveries, so without this dimension it reads exactly like an alert
        // that matched no route.
        parseFailed: input.parseFailed,
        // Events share the destination dimension with the delivery list now;
        // `missing` is what makes "which alerts never reached this target"
        // answerable without opening each event.
        destinationId: input.destinationId,
        destinationMatch: input.destinationMatch,
        // Scopes the state question to that target: the event-level
        // `deliveryOutcome` still answers "any delivery anywhere".
        destinationOutcome: input.destinationOutcome,
        q: input.q,
        // Exact identity rather than a search: the recurrence view links here
        // so "see every occurrence" cannot drift into substring matches.
        fingerprint: input.fingerprint,
        since,
        until: input.rangeUntil,
        page: input.eventPage ?? 1,
      }),
      this.store.history.listDeliveries({
        limit,
        sourceId: input.sourceId,
        severity: input.severity,
        status: input.status,
        destinationId: input.destinationId,
        destinationKind: input.destinationKind,
        routeId: input.routeId,
        eventId: input.eventId,
        // Shared with the events list: the recurrence view answers "every
        // notification this alert ever sent", which is a delivery question.
        fingerprint: input.fingerprint,
        receipt: input.receipt,
        state: input.deliveryState,
        minAttempts: input.minAttempts,
        lastAttemptStatusClass: input.lastAttemptStatusClass,
        // The companion question: did the target answer at all? Without it a
        // timeout is only visible in the row's free-text error.
        lastAttemptResponse: input.lastAttemptResponse,
        timeField: input.timeField,
        q: input.q,
        since,
        until: input.rangeUntil,
        page: input.deliveryPage ?? 1,
      }),
    ]);

    return { events, deliveries };
  }

  async getEventDetail(eventId: string) {
    return this.store.history.getEventDetail(eventId);
  }

  /**
   * Read-only recurrence context for one event. Delegated whole: the same
   * source+fingerprint predicate and the redaction rules belong in the
   * projection, not in the transport layer.
   */
  async getEventFingerprintContext(eventId: string): Promise<EventFingerprintContext | null> {
    return this.store.history.getEventFingerprintContext(eventId);
  }

  async getDeliveryDetail(deliveryId: string): Promise<DeliveryDetail | null> {
    return this.store.deliveries.get(deliveryId);
  }

  /**
   * Queue projection for the paused banner. The clock is resolved once so the
   * count and the oldest waiting timestamp describe the same instant.
   */
  async getDeliveryBacklog(): Promise<DeliveryBacklogSummary> {
    return this.store.deliveries.summarizeClaimable({
      now: this.now().toISOString(),
    });
  }

  /**
   * What the worker would do with this failed delivery if it were retried.
   *
   * A retry only re-queues the job. Everything that decides the outcome — the
   * claim's enabled checks, the suppression re-evaluation, the paging gate —
   * happens after the operator confirms, so the preview answers both halves of
   * the question: "will this be swallowed?" and "who could be called?".
   *
   * The two halves are not independent. A matched suppression is applied at
   * claim time, before any send, so the retry ends terminal and no phone rings;
   * advertising calls there would be as wrong as hiding them everywhere else.
   * Both halves stay advisory and never block the retry.
   */
  async previewDeliveryRetry(deliveryId: string): Promise<DeliveryRetryPreview | null> {
    const job = await this.store.deliveries.getJob(deliveryId);

    if (!job) {
      return null;
    }

    const now = this.now().toISOString();
    const [event, destination, route] = await Promise.all([
      this.store.intake.get(job.eventId),
      this.store.destinations.get(job.destinationId),
      job.routeId ? this.store.routes.get(job.routeId) : Promise.resolve(null),
    ]);

    const suppression = await this.retrySuppression(job, event, now);

    // `claimNext` skips a disabled destination and a disabled route, so a
    // retry that can never be claimed must not advertise a phone call.
    const claimable =
      event !== null &&
      destination !== null &&
      destination.enabled &&
      (!job.routeId || route?.enabled === true);

    return {
      deliveryId: job.id,
      suppression,
      urgentPaging:
        claimable && suppression.status !== "matched"
          ? retryUrgentPaging(event, destination)
          : emptyUrgentPaging(),
    };
  }

  /**
   * The suppression the claim step would apply to this retry.
   *
   * Uses the same selection as `claimNext` so the dialog and the worker cannot
   * disagree about which rule wins. Only rules active at `now` count; the claim
   * re-reads the clock, so this projects "what happens if it is picked up now"
   * rather than promising the future.
   */
  private async retrySuppression(
    job: DeliveryJob,
    event: EventRecord | null,
    now: string,
  ): Promise<DeliveryRetrySuppression> {
    if (!event) {
      return emptySuppression("unavailable");
    }

    const suppressions = await this.store.suppressions.list();
    const match = selectSuppressionForDelivery(
      suppressions,
      {
        sourceId: event.sourceId,
        destinationId: job.destinationId,
        event: event.normalized,
      },
      now,
    );
    // The selection returns the winning rule by id; the row is kept so the
    // dialog can say when the window closes, which the match result omits.
    const rule = match
      ? suppressions.find((candidate) => candidate.id === match.suppressionId)
      : null;

    if (!match || !rule) {
      return emptySuppression("none");
    }

    return {
      status: "matched",
      suppressionId: rule.id,
      suppressionName: rule.name,
      suppressionKind: rule.kind,
      endsAt: rule.endsAt,
    };
  }

  async retryDelivery(deliveryId: string): Promise<DeliveryJob> {
    return this.store.deliveries.retryNow({ deliveryId });
  }

  /**
   * Manual urgent paging for one delivery; the operator is recorded on every
   * page for audit.
   */
  async buzzDelivery(deliveryId: string, initiatedBy: string | null): Promise<DeliveryPingsResult> {
    const pings = await this.oncall.buzzDelivery({ deliveryId, initiatedBy });

    return { deliveryId, pings };
  }
}

/**
 * Resolves a relative window to the absolute lower bound the repository
 * compares against.
 *
 * The bound is exclusive of nothing: a record exactly on the boundary is
 * inside the window. There is no upper bound, because "the last hour" means
 * "up to now", and a future-dated record is a data problem the operator should
 * still see rather than have hidden by a filter.
 *
 * An anchor pins "now" to the instant the operator opened the window, so the
 * lower bound no longer moves between page requests or when a shared link is
 * reopened. Without one the window keeps following the clock, which is the
 * behavior every existing link already has.
 */
function timeRangeSince(
  range: OperationTimeRange | undefined,
  now: Date,
  anchorInput?: string,
): string | undefined {
  if (!range) {
    return undefined;
  }

  const anchor = resolveRangeAnchor(anchorInput, now);

  return new Date(anchor.getTime() - TIME_RANGE_MS[range]).toISOString();
}

/**
 * Resolves the anchor, falling back to the request time.
 *
 * A client clock running ahead would otherwise push the lower bound into the
 * future and empty the list for a window that is supposed to exist, so a
 * future anchor is clamped to the request time. Unparseable input falls back
 * for the same reason: a hand-edited URL must not break the read path.
 */
function resolveRangeAnchor(anchorInput: string | undefined, now: Date): Date {
  if (!anchorInput) {
    return now;
  }

  const parsed = Date.parse(anchorInput);

  if (!Number.isFinite(parsed)) {
    return now;
  }

  const anchor = new Date(parsed);

  return anchor.getTime() > now.getTime() ? now : anchor;
}

/**
 * Who the paging gate would ring if this one delivery were sent successfully.
 *
 * Pure projection over already-loaded rows: the caller has established that
 * the delivery is claimable, so this only asks whether the destination's urgent
 * config and the alert's severity clear the automatic paging gate.
 */
function retryUrgentPaging(
  event: EventRecord,
  destination: DestinationRuntimeConfig,
): UrgentPagingImpact {
  const receivers = feishuUrgentPagingReceivers({
    config: destination.config,
    status: event.normalized.status,
    severity: event.normalized.severity,
  });

  if (receivers.length === 0) {
    return emptyUrgentPaging();
  }

  return {
    destinations: [
      {
        destinationId: destination.id,
        destinationName: destination.name,
        receiverCount: receivers.length,
      },
    ],
    deliveryCount: 1,
    receiverCount: receivers.length,
  };
}

/** A fresh "no rule decided" projection; never shared between reads. */
function emptySuppression(status: DeliveryRetrySuppressionStatus): DeliveryRetrySuppression {
  return {
    status,
    suppressionId: null,
    suppressionName: null,
    suppressionKind: null,
    endsAt: null,
  };
}

/** A fresh "nobody would be called" projection; never shared between reads. */
function emptyUrgentPaging(): UrgentPagingImpact {
  return { destinations: [], deliveryCount: 0, receiverCount: 0 };
}
