import { getLogger } from "@logtape/logtape";

import {
  DELIVERY_ACCEPTED_UNRECORDED_ERROR,
  type DeliveryJob,
  readProviderAlertCount,
  redactJsonText,
  redactNormalizedEvent,
  redactText,
} from "@tocsin/core";
import type {
  DestinationErrorKind,
  DestinationRetryHint,
  DestinationSendContext,
  DestinationRegistry,
  DestinationPresentation,
  DestinationSendResult,
} from "@tocsin/destinations";

import { RecordNotFoundError } from "#/infra/sqlite/errors";
import type {
  ClaimedDelivery,
  DeliveryRepository,
} from "#/infra/sqlite/repositories/delivery/delivery.interface";
import { deliveryDetailUrl, eventDetailUrl } from "#/lib/dashboard-url";
import type { DestinationConfigResolver } from "#/server/integrations/destination-config-resolver";
import type { OncallPingTrigger } from "#/server/oncall/oncall.service.types";
import { DomainValidationError } from "#/server/runtime/domain-errors";
import { safeErrorProperties } from "#/server/runtime/log-safety";

const deliveryLogger = getLogger(["tocsin", "delivery"]);

export interface DeliveryExecutionStore {
  readonly deliveries: Pick<DeliveryRepository, "markSucceeded" | "markFailed">;
}

export interface DeliveryExecutionOptions {
  store: DeliveryExecutionStore;
  destinations: Pick<DestinationRegistry, "send">;
  sendContext?: DestinationSendContext;
  backoff?: DeliveryBackoffOptions;
  /** Resolves server-side references (for example a Feishu app credential) before the send. */
  resolveDestinationConfig?: DestinationConfigResolver;
  /**
   * Deployment address used to build `tocsin.eventUrl`. Empty or missing keeps
   * the template variable empty, which is the pre-existing behavior.
   */
  publicBaseUrl?: string;
  /**
   * Auto-paging hook: called after a successful send that carries a provider
   * reference. A trigger failure never fails the delivery.
   */
  triggerPings?: OncallPingTrigger;
}

export interface DeliveryBackoffOptions {
  initialDelayMs?: number;
  maxDelayMs?: number;
}

export type DeliveryExecutionOutcome = "succeeded" | "retrying" | "failed";

export class DeliveryExecution {
  private readonly store: DeliveryExecutionStore;
  private readonly destinations: Pick<DestinationRegistry, "send">;
  private readonly sendContext?: DestinationSendContext;
  private readonly resolveDestinationConfig?: DestinationConfigResolver;
  private readonly publicBaseUrl?: string;
  private readonly triggerPings?: OncallPingTrigger;
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(options: DeliveryExecutionOptions) {
    this.store = options.store;
    this.destinations = options.destinations;
    this.sendContext = options.sendContext;
    this.resolveDestinationConfig = options.resolveDestinationConfig;
    this.publicBaseUrl = options.publicBaseUrl;
    this.triggerPings = options.triggerPings;
    this.initialDelayMs = options.backoff?.initialDelayMs ?? 30_000;
    this.maxDelayMs = options.backoff?.maxDelayMs ?? 15 * 60_000;
  }

  async execute(
    delivery: ClaimedDelivery,
    now: string,
    presentation?: DestinationPresentation,
    /**
     * Wall clock for this attempt. `now` is the batch timestamp and stays the
     * fallback for deterministic callers; the worker passes a live clock so the
     * attempt's start and finish reflect the actual send instead of the batch
     * claim, which used to make `finishedAt - startedAt` always zero.
     */
    clock: () => string = () => now,
  ): Promise<DeliveryExecutionOutcome> {
    const startedAt = clock();

    // The send gets its own try. Once the target has accepted the alert the
    // delivery must never fall back into the generic "unknown error, retry"
    // path below, because a retry would deliver the same alert twice.
    let sendResult: DestinationSendResult;

    try {
      const config = this.resolveDestinationConfig
        ? await this.resolveDestinationConfig({
            kind: delivery.destination.kind,
            config: delivery.destination.config,
          })
        : delivery.destination.config;
      sendResult = await this.destinations.send(
        delivery.destination.kind,
        {
          eventId: delivery.event.id,
          eventUrl: eventDetailUrl(this.publicBaseUrl, delivery.event.id),
          deliveryUrl: deliveryDetailUrl(this.publicBaseUrl, delivery.job.id),
          // The group size is an upstream fact recorded at intake; it is a
          // count, not payload content, so it needs no redaction.
          alertCount: readProviderAlertCount(delivery.event.providerMetadata),
          source: delivery.source,
          destination: delivery.destination,
          // Routing and suppression already decided against the raw event; the
          // outbound copy is projected so a credential in the alert body does
          // not leave the host.
          normalizedEvent: redactNormalizedEvent(delivery.event.normalized),
          payload: redactJsonText(delivery.event.rawPayload),
          config,
          presentation,
        },
        this.sendContext,
      );
    } catch (error) {
      if (error instanceof DomainValidationError) {
        return await this.markFailed(delivery, {
          error: error.message,
          errorKind: "configuration_error",
          retryHint: "not_retryable",
          startedAt,
          finishedAt: clock(),
        });
      }

      const safeError = safeErrorProperties(error);

      return await this.markFailed(delivery, {
        error: safeError.errorMessage,
        errorKind: "unknown_error",
        errorName: safeError.errorName,
        startedAt,
        finishedAt: clock(),
      });
    }

    if (!sendResult.ok) {
      return await this.markFailed(delivery, {
        error: sendResult.errorMessage,
        responseStatus: sendResult.statusCode ?? undefined,
        responseBody: redactOptionalText(sendResult.responseBody),
        errorKind: sendResult.errorKind,
        retryHint: sendResult.retryHint,
        startedAt,
        finishedAt: clock(),
      });
    }

    return await this.recordSuccess(delivery, sendResult, startedAt, clock);
  }

  /**
   * Records a send the target has already accepted.
   *
   * Order matters: the urgent page goes out first, because a phone call is the
   * irreversible half of a delivery and must never depend on a local write.
   * Ping enqueue dedupes on (fingerprint, destination, receiver), so replaying
   * the same alert does not call anyone twice inside the dedupe window.
   */
  private async recordSuccess(
    delivery: ClaimedDelivery,
    sendResult: Extract<DestinationSendResult, { ok: true }>,
    startedAt: string,
    clock: () => string,
  ): Promise<DeliveryExecutionOutcome> {
    const finishedAt = clock();

    if (this.triggerPings && sendResult.providerReference) {
      try {
        await this.triggerPings({
          delivery,
          providerReference: sendResult.providerReference,
          now: finishedAt,
        });
      } catch (error) {
        deliveryLogger.warn("Urgent paging trigger failed for {deliveryId}", {
          deliveryId: delivery.job.id,
          destinationId: delivery.destination.id,
          ...safeErrorProperties(error),
        });
      }
    }

    const recorded = await this.recordSucceeded(delivery, sendResult, startedAt, finishedAt);

    if (recorded) {
      deliveryLogger.info("Delivery {deliveryId} succeeded via {destinationKind}", {
        deliveryId: delivery.job.id,
        attemptId: delivery.attempt.id,
        attemptNumber: delivery.attempt.attemptNumber,
        eventId: delivery.event.id,
        sourceId: delivery.source.id,
        destinationId: delivery.destination.id,
        destinationKind: delivery.destination.kind,
        responseStatus: sendResult.statusCode,
      });

      return "succeeded";
    }

    // Both writes failed. Land a terminal failure whose message says the alert
    // was delivered, so an operator does not resend it by hand, and never let
    // this fallback throw out of the batch.
    //
    // Retry the write once, like `recordSucceeded`: this row is the only local
    // evidence that the target accepted the alert. If it never lands, the stale
    // attempt reclaim cannot tell this delivery apart from one whose worker
    // died before sending, and it will schedule a duplicate attempt.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await this.markFailed(delivery, {
          error: DELIVERY_ACCEPTED_UNRECORDED_ERROR,
          // Keep the target's success response on the failure row: an operator
          // debugging this state needs the evidence that the send itself worked.
          responseStatus: sendResult.statusCode ?? undefined,
          responseBody: redactOptionalText(sendResult.responseBody),
          errorKind: "unknown_error",
          retryHint: "not_retryable",
          startedAt,
          finishedAt: clock(),
        });
        break;
      } catch (error) {
        if (attempt === 1) {
          deliveryLogger.error("Delivery {deliveryId} succeeded but could not be recorded", {
            deliveryId: delivery.job.id,
            attemptId: delivery.attempt.id,
            destinationId: delivery.destination.id,
            ...safeErrorProperties(error),
          });
        }
      }
    }

    return "failed";
  }

  /**
   * `markSucceeded` updates by id and is idempotent, so one transient write
   * failure may be retried before the delivery is declared unrecordable.
   */
  private async recordSucceeded(
    delivery: ClaimedDelivery,
    sendResult: Extract<DestinationSendResult, { ok: true }>,
    startedAt: string,
    finishedAt: string,
  ): Promise<boolean> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await this.store.deliveries.markSucceeded({
          deliveryId: delivery.job.id,
          attemptId: delivery.attempt.id,
          renderedPayload: sendResult.renderedPayload,
          providerReference: sendResult.providerReference,
          responseStatus: sendResult.statusCode ?? undefined,
          responseBody: redactOptionalText(sendResult.responseBody),
          startedAt,
          finishedAt,
        });

        return true;
      } catch (error) {
        if (attempt === 1) {
          deliveryLogger.error("Recording delivery {deliveryId} success failed", {
            deliveryId: delivery.job.id,
            attemptId: delivery.attempt.id,
            destinationId: delivery.destination.id,
            ...safeErrorProperties(error),
          });
        }
      }
    }

    return false;
  }

  private async markFailed(
    delivery: ClaimedDelivery,
    input: {
      error: string;
      errorKind: DestinationErrorKind;
      errorName?: string;
      retryHint?: DestinationRetryHint;
      responseStatus?: number;
      responseBody?: string;
      startedAt: string;
      finishedAt: string;
    },
  ): Promise<"retrying" | "failed"> {
    const retryAt = this.nextRetryAt(delivery, input.finishedAt, input.retryHint);
    let updated: DeliveryJob;

    try {
      updated = await this.store.deliveries.markFailed({
        deliveryId: delivery.job.id,
        attemptId: delivery.attempt.id,
        error: redactText(input.error),
        retryAt,
        responseStatus: input.responseStatus,
        responseBody: redactOptionalText(input.responseBody),
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
      });
    } catch (error) {
      // A delivery row that a concurrent event deletion cascaded away has
      // nothing left to record. That is terminal, not a reason to abort the
      // batch. Transient write failures keep throwing: the caller's retry (the
      // post-send evidence write) and the stale attempt reclaim both depend on
      // seeing them.
      if (!(error instanceof RecordNotFoundError)) {
        throw error;
      }

      deliveryLogger.error("Delivery {deliveryId} failure was not recorded", {
        deliveryId: delivery.job.id,
        attemptId: delivery.attempt.id,
        attemptNumber: delivery.attempt.attemptNumber,
        eventId: delivery.event.id,
        sourceId: delivery.source.id,
        destinationId: delivery.destination.id,
        destinationKind: delivery.destination.kind,
        errorKind: input.errorKind,
        retryHint: input.retryHint ?? "retryable",
        ...safeErrorProperties(error),
      });

      return "failed";
    }

    const outcome = updated.state === "pending" ? "retrying" : "failed";

    deliveryLogger.warn("Delivery {deliveryId} is {outcome} via {destinationKind}", {
      deliveryId: delivery.job.id,
      attemptId: delivery.attempt.id,
      attemptNumber: delivery.attempt.attemptNumber,
      eventId: delivery.event.id,
      sourceId: delivery.source.id,
      destinationId: delivery.destination.id,
      destinationKind: delivery.destination.kind,
      outcome,
      errorKind: input.errorKind,
      ...(input.errorName ? { errorName: input.errorName } : {}),
      errorMessage: redactText(input.error),
      retryHint: input.retryHint ?? "retryable",
      responseStatus: input.responseStatus ?? null,
    });

    return outcome;
  }

  private nextRetryAt(
    delivery: ClaimedDelivery,
    now: string,
    retryHint: DestinationRetryHint = "retryable",
  ): string | null {
    if (retryHint === "not_retryable") {
      return null;
    }

    if (delivery.job.attemptCount >= delivery.job.maxAttempts) {
      return null;
    }

    const delay = Math.min(
      this.initialDelayMs * 2 ** Math.max(0, delivery.job.attemptCount - 1),
      this.maxDelayMs,
    );

    return new Date(new Date(now).valueOf() + delay).toISOString();
  }
}

function redactOptionalText(value: string | null | undefined): string | undefined {
  return value === null || value === undefined ? undefined : redactText(value);
}
