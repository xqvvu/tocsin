import { getLogger } from "@logtape/logtape";

import { redactJsonValue, redactText } from "@tocsin/core";
import type {
  DestinationErrorKind,
  DestinationRetryHint,
  DestinationSendContext,
  DestinationRegistry,
  DestinationPresentation,
} from "@tocsin/destinations";

import type {
  ClaimedDelivery,
  DeliveryRepository,
} from "#/infra/sqlite/repositories/delivery/delivery.interface";
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
  private readonly triggerPings?: OncallPingTrigger;
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(options: DeliveryExecutionOptions) {
    this.store = options.store;
    this.destinations = options.destinations;
    this.sendContext = options.sendContext;
    this.resolveDestinationConfig = options.resolveDestinationConfig;
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

    try {
      const config = this.resolveDestinationConfig
        ? await this.resolveDestinationConfig({
            kind: delivery.destination.kind,
            config: delivery.destination.config,
          })
        : delivery.destination.config;
      const sendResult = await this.destinations.send(
        delivery.destination.kind,
        {
          eventId: delivery.event.id,
          source: delivery.source,
          destination: delivery.destination,
          normalizedEvent: delivery.event.normalized,
          payload: redactJsonValue(delivery.event.rawPayload),
          config,
          presentation,
        },
        this.sendContext,
      );

      if (sendResult.ok) {
        const finishedAt = clock();

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

      return await this.markFailed(delivery, {
        error: sendResult.errorMessage,
        responseStatus: sendResult.statusCode ?? undefined,
        responseBody: redactOptionalText(sendResult.responseBody),
        errorKind: sendResult.errorKind,
        retryHint: sendResult.retryHint,
        startedAt,
        finishedAt: clock(),
      });
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
    const updated = await this.store.deliveries.markFailed({
      deliveryId: delivery.job.id,
      attemptId: delivery.attempt.id,
      error: redactText(input.error),
      retryAt,
      responseStatus: input.responseStatus,
      responseBody: redactOptionalText(input.responseBody),
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
    });
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
