import { getLogger } from "@logtape/logtape";

import { redactText } from "@tocsin/core";
import {
  UrgencyChannelKindSchema,
  type DestinationRetryHint,
  type DestinationSendContext,
  type UrgencyRegistry,
} from "@tocsin/destinations";
import { FeishuConfigSchema } from "@tocsin/destinations/feishu";

import type {
  ClaimedOncallPing,
  OncallRepository,
} from "#/infra/sqlite/repositories/oncall/oncall.interface";
import type { DeliveryBackoffOptions } from "#/server/deliveries/delivery-execution";
import type { DestinationConfigResolver } from "#/server/integrations/destination-config-resolver";
import { DomainValidationError } from "#/server/runtime/domain-errors";
import { safeErrorProperties } from "#/server/runtime/log-safety";

const oncallLogger = getLogger(["tocsin", "oncall"]);

export interface OncallExecutionStore {
  readonly oncall: Pick<OncallRepository, "markDispatchStarted" | "markFired" | "markFailed">;
}

export interface OncallExecutionOptions {
  store: OncallExecutionStore;
  urgency: Pick<UrgencyRegistry, "ping">;
  resolveDestinationConfig?: DestinationConfigResolver;
  sendContext?: DestinationSendContext;
  backoff?: DeliveryBackoffOptions;
  /** Clock used for the dispatch marker, so it anchors to the call, not the claim. */
  now?: () => string;
}

export type OncallExecutionOutcome = "fired" | "retrying" | "failed" | "superseded";

/**
 * Executes one urgent call.
 *
 * The ping owns its own lifecycle: a failed call is retried on this ping alone
 * and never re-posts (or re-touches) the alert card, and a delivery retry
 * never repeats a call that already fired. The message acted on is the
 * delivery's provider reference; the credential is resolved server-side from
 * the destination's app reference at execution time.
 */
export class OncallExecution {
  private readonly store: OncallExecutionStore;
  private readonly urgency: Pick<UrgencyRegistry, "ping">;
  private readonly resolveDestinationConfig?: DestinationConfigResolver;
  private readonly sendContext?: DestinationSendContext;
  private readonly now: () => string;
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(options: OncallExecutionOptions) {
    this.store = options.store;
    this.urgency = options.urgency;
    this.resolveDestinationConfig = options.resolveDestinationConfig;
    this.sendContext = options.sendContext;
    this.now = options.now ?? (() => new Date().toISOString());
    this.initialDelayMs = options.backoff?.initialDelayMs ?? 30_000;
    this.maxDelayMs = options.backoff?.maxDelayMs ?? 15 * 60_000;
  }

  async execute(claimed: ClaimedOncallPing, now: string): Promise<OncallExecutionOutcome> {
    try {
      const config = this.resolveDestinationConfig
        ? await this.resolveDestinationConfig({
            kind: claimed.destination.kind,
            config: claimed.destination.config,
          })
        : claimed.destination.config;
      const parsed = FeishuConfigSchema.safeParse(config);
      const app = parsed.success ? parsed.data.app : undefined;
      const urgent = parsed.success ? parsed.data.urgent : undefined;
      const messageId = claimed.ping.providerReference?.value;
      const channel = UrgencyChannelKindSchema.safeParse(claimed.ping.channel);

      if (!app?.appId || !app.appSecret || !urgent || !messageId || !channel.success) {
        return await this.markFailed(claimed, {
          error:
            "Feishu urgent paging requires an app-mode destination with resolved credentials and a message reference",
          retryHint: "not_retryable",
          now,
        });
      }

      // Fence this attempt to the row before the provider is asked to call. A
      // slow batch can take longer than the stale window, so another worker
      // may have reclaimed and re-claimed this ping; ringing then would place
      // a second, irreversible call for the same receiver.
      const ownsAttempt = await this.recordDispatchStarted(claimed);

      if (!ownsAttempt) {
        return "superseded";
      }

      const result = await this.urgency.ping(
        channel.data,
        {
          app: { appId: app.appId, appSecret: app.appSecret },
          messageId,
          receivers: [claimed.ping.receiver],
          userIdType: urgent.userIdType,
        },
        this.sendContext,
      );

      if (result.ok) {
        return await this.recordFired(claimed, now);
      }

      return await this.markFailed(claimed, {
        error: result.errorMessage,
        retryHint: result.retryHint,
        now,
      });
    } catch (error) {
      if (error instanceof DomainValidationError) {
        return await this.markFailed(claimed, {
          error: error.message,
          retryHint: "not_retryable",
          now,
        });
      }

      const safeError = safeErrorProperties(error);

      return await this.markFailed(claimed, {
        error: safeError.errorMessage,
        retryHint: "retryable",
        now,
      });
    }
  }

  /**
   * Fences this attempt to the ping and records the intent to ring.
   *
   * Returns `false` when the row no longer belongs to this attempt: another
   * worker reclaimed it after the stale window and claimed it again, so it is
   * now responsible for the call. A write failure returns `true` on purpose:
   * paging must never depend on bookkeeping
   * (docs/planning/decisions/delivery-success-persistence-failure.md), so it
   * degrades to the pre-marker behavior for this attempt.
   */
  private async recordDispatchStarted(claimed: ClaimedOncallPing): Promise<boolean> {
    try {
      // The marker also refreshes `updated_at`, which must anchor to the call
      // rather than to the batch claim: a batch can spend minutes on earlier
      // pings before it reaches this one.
      const started = await this.store.oncall.markDispatchStarted({
        pingId: claimed.ping.id,
        expectedAttemptCount: claimed.ping.attemptCount,
        startedAt: this.now(),
      });

      if (started) {
        return true;
      }

      oncallLogger.warn("Urgent call {pingId} was reclaimed before dialling; skipping", {
        pingId: claimed.ping.id,
        deliveryId: claimed.ping.deliveryId,
        destinationId: claimed.ping.destinationId,
        receiver: claimed.ping.receiver,
        attemptNumber: claimed.ping.attemptCount,
      });

      return false;
    } catch (error) {
      oncallLogger.warn("Urgent call {pingId} dispatch intent could not be recorded", {
        pingId: claimed.ping.id,
        deliveryId: claimed.ping.deliveryId,
        destinationId: claimed.ping.destinationId,
        receiver: claimed.ping.receiver,
        ...safeErrorProperties(error),
      });

      return true;
    }
  }

  /**
   * Records a call the provider already accepted.
   *
   * Once the provider accepts the call, a persistence failure must never fall
   * back into the retry path: the retry would ring the same receiver again.
   * The write is idempotent, so it is attempted twice; after that the ping is
   * closed as terminally failed with an explicit "call was placed" message so
   * an operator does not page manually, and the failure never escapes the
   * worker batch.
   */
  private async recordFired(
    claimed: ClaimedOncallPing,
    now: string,
  ): Promise<OncallExecutionOutcome> {
    try {
      await this.store.oncall.markFired({ pingId: claimed.ping.id, firedAt: now });
    } catch (firstError) {
      oncallLogger.error("Urgent call {pingId} fired but its state could not be recorded", {
        pingId: claimed.ping.id,
        deliveryId: claimed.ping.deliveryId,
        destinationId: claimed.ping.destinationId,
        receiver: claimed.ping.receiver,
        ...safeErrorProperties(firstError),
      });

      try {
        await this.store.oncall.markFired({ pingId: claimed.ping.id, firedAt: now });
      } catch (error) {
        return await this.markDispatchedButUnrecorded(claimed, now, error);
      }
    }

    oncallLogger.info("Urgent call {pingId} fired for {receiver}", {
      pingId: claimed.ping.id,
      deliveryId: claimed.ping.deliveryId,
      destinationId: claimed.ping.destinationId,
      receiver: claimed.ping.receiver,
      attemptNumber: claimed.ping.attemptCount,
    });

    return "fired";
  }

  /**
   * Best-effort terminal state for a call that already went out. It never
   * schedules a retry and never throws, so one bad row cannot abort the batch
   * and cannot cause a second call.
   */
  private async markDispatchedButUnrecorded(
    claimed: ClaimedOncallPing,
    now: string,
    error: unknown,
  ): Promise<"failed"> {
    const safeError = safeErrorProperties(error);

    try {
      await this.store.oncall.markFailed({
        pingId: claimed.ping.id,
        error: `Urgent call was placed but its state could not be recorded: ${safeError.errorMessage}`,
        retryAt: null,
        updatedAt: now,
      });
    } catch (persistError) {
      oncallLogger.error("Urgent call {pingId} terminal state could not be recorded", {
        pingId: claimed.ping.id,
        deliveryId: claimed.ping.deliveryId,
        destinationId: claimed.ping.destinationId,
        receiver: claimed.ping.receiver,
        ...safeErrorProperties(persistError),
      });
    }

    oncallLogger.warn("Urgent call {pingId} was placed but is recorded as failed", {
      pingId: claimed.ping.id,
      deliveryId: claimed.ping.deliveryId,
      destinationId: claimed.ping.destinationId,
      receiver: claimed.ping.receiver,
      attemptNumber: claimed.ping.attemptCount,
      ...safeError,
    });

    return "failed";
  }

  private async markFailed(
    claimed: ClaimedOncallPing,
    input: { error: string; retryHint: DestinationRetryHint; now: string },
  ): Promise<"retrying" | "failed"> {
    const retryAt = this.nextRetryAt(claimed, input.now, input.retryHint);
    const updated = await this.store.oncall.markFailed({
      pingId: claimed.ping.id,
      error: redactText(input.error),
      retryAt,
      updatedAt: input.now,
    });
    const outcome = updated.state === "scheduled" ? "retrying" : "failed";

    oncallLogger.warn("Urgent call {pingId} is {outcome} for {receiver}", {
      pingId: claimed.ping.id,
      deliveryId: claimed.ping.deliveryId,
      destinationId: claimed.ping.destinationId,
      receiver: claimed.ping.receiver,
      attemptNumber: claimed.ping.attemptCount,
      outcome,
      errorMessage: redactText(input.error),
      retryHint: input.retryHint,
    });

    return outcome;
  }

  private nextRetryAt(
    claimed: ClaimedOncallPing,
    now: string,
    retryHint: DestinationRetryHint,
  ): string | null {
    if (retryHint === "not_retryable") {
      return null;
    }

    if (claimed.ping.attemptCount >= claimed.ping.maxAttempts) {
      return null;
    }

    const delay = Math.min(
      this.initialDelayMs * 2 ** Math.max(0, claimed.ping.attemptCount - 1),
      this.maxDelayMs,
    );

    return new Date(new Date(now).valueOf() + delay).toISOString();
  }
}
