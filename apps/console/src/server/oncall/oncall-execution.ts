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
  readonly oncall: Pick<OncallRepository, "markFired" | "markFailed">;
}

export interface OncallExecutionOptions {
  store: OncallExecutionStore;
  urgency: Pick<UrgencyRegistry, "ping">;
  resolveDestinationConfig?: DestinationConfigResolver;
  sendContext?: DestinationSendContext;
  backoff?: DeliveryBackoffOptions;
}

export type OncallExecutionOutcome = "fired" | "retrying" | "failed";

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
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(options: OncallExecutionOptions) {
    this.store = options.store;
    this.urgency = options.urgency;
    this.resolveDestinationConfig = options.resolveDestinationConfig;
    this.sendContext = options.sendContext;
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
        await this.store.oncall.markFired({ pingId: claimed.ping.id, firedAt: now });
        oncallLogger.info("Urgent call {pingId} fired for {receiver}", {
          pingId: claimed.ping.id,
          deliveryId: claimed.ping.deliveryId,
          destinationId: claimed.ping.destinationId,
          receiver: claimed.ping.receiver,
          attemptNumber: claimed.ping.attemptCount,
        });

        return "fired";
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
