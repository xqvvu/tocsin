import { getLogger } from "@logtape/logtape";

import type { OncallPing } from "@tocsin/core";
import type { UrgencyChannelKind } from "@tocsin/destinations";
import { FeishuConfigSchema } from "@tocsin/destinations/feishu";

import { RecordNotFoundError } from "#/infra/sqlite/errors";
import type {
  BuzzDeliveryInput,
  OncallPingTriggerInput,
  OncallServiceOptions,
} from "#/server/oncall/oncall.service.types";
import { DomainValidationError } from "#/server/runtime/domain-errors";
import { safeErrorProperties } from "#/server/runtime/log-safety";

const oncallLogger = getLogger(["tocsin", "oncall"]);

const DEFAULT_DEDUPE_WINDOW_MS = 5 * 60_000;
const URGENT_CHANNEL: UrgencyChannelKind = "feishu_urgent_phone";

/**
 * Urgent paging.
 *
 * The automatic trigger is deliberately narrow: only a succeeded app-mode
 * Feishu delivery of a firing alert whose severity passes the destination's
 * urgent gate creates pings. Manual paging reuses the same records and gate
 * for one delivery an operator is looking at. Pings are per receiver and
 * deduplicated per fingerprint + destination + receiver, so an alert storm
 * cannot become a call storm. Every other delivery, including webhook-mode
 * sends, has nothing to page.
 */
export class OncallService {
  private readonly store: OncallServiceOptions["store"];
  private readonly dedupeWindowMs: number;
  private readonly now: () => string;
  private readonly dispatchNow?: OncallServiceOptions["dispatchNow"];

  constructor(options: OncallServiceOptions) {
    this.store = options.store;
    this.dedupeWindowMs = options.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS;
    this.now = options.now ?? (() => new Date().toISOString());
    this.dispatchNow = options.dispatchNow;
  }

  /**
   * Manual paging for one delivery.
   *
   * The receivers and user id type come from the destination's urgent block,
   * and the message acted on is the delivery's own provider reference — a
   * delivery without one (a webhook-mode send) cannot be paged. Records are
   * queued with the manual trigger and the operator recorded, then dispatched
   * immediately as a best effort; whatever does not fire stays queued for the
   * worker.
   */
  async buzzDelivery(input: BuzzDeliveryInput): Promise<OncallPing[]> {
    const delivery = await this.store.deliveries.get(input.deliveryId);

    if (!delivery) {
      throw new RecordNotFoundError("Delivery", input.deliveryId);
    }

    const providerReference = delivery.providerReference;

    if (!providerReference) {
      throw new DomainValidationError(
        "This delivery has no Feishu message reference, so it cannot be paged. Only app-mode sends can be paged",
      );
    }

    const destination = await this.store.destinations.get(delivery.job.destinationId);

    if (!destination) {
      throw new RecordNotFoundError("Destination", delivery.job.destinationId);
    }

    const parsed = FeishuConfigSchema.safeParse(destination.config);
    const urgent = parsed.success ? parsed.data.urgent : undefined;

    if (!urgent || urgent.receivers.length === 0) {
      throw new DomainValidationError(
        "Configure urgent receivers on this destination before paging manually",
      );
    }

    const now = this.now();
    const dedupeWindowStartsAt = new Date(
      new Date(now).valueOf() - this.dedupeWindowMs,
    ).toISOString();
    const created: OncallPing[] = [];

    for (const receiver of urgent.receivers) {
      const ping = await this.store.oncall.enqueueForDelivery({
        deliveryId: delivery.job.id,
        destinationId: destination.id,
        eventId: delivery.event.id,
        fingerprint: delivery.event.normalized.fingerprint,
        receiver,
        channel: URGENT_CHANNEL,
        providerReference,
        trigger: "manual",
        initiatedBy: input.initiatedBy ?? null,
        dedupeWindowStartsAt,
        now,
      });

      if (ping) {
        created.push(ping);
      }
    }

    if (created.length === 0) {
      throw new DomainValidationError(
        "These receivers were already paged for this alert; wait for the dedupe window before paging again",
      );
    }

    try {
      await this.dispatchNow?.(now);
    } catch (error) {
      oncallLogger.warn("Immediate paging dispatch failed; the worker will retry", {
        deliveryId: delivery.job.id,
        ...safeErrorProperties(error),
      });
    }

    return await Promise.all(
      created.map(async (ping) => (await this.store.oncall.get(ping.id)) ?? ping),
    );
  }

  async triggerPingsForDelivery(input: OncallPingTriggerInput): Promise<void> {
    const { destination, event } = input.delivery;

    if (destination.kind !== "feishu") {
      return;
    }

    const parsed = FeishuConfigSchema.safeParse(destination.config);

    if (!parsed.success) {
      return;
    }

    const { sendMode, urgent } = parsed.data;
    const now = input.now ?? this.now();

    if (sendMode !== "app" || !urgent?.autoEnabled) {
      return;
    }

    if (event.normalized.status !== "firing") {
      return;
    }

    if (
      urgent.severities.length > 0 &&
      !urgent.severities.some((severity) => severity === event.normalized.severity)
    ) {
      return;
    }

    const dedupeWindowStartsAt = new Date(
      new Date(now).valueOf() - this.dedupeWindowMs,
    ).toISOString();
    let queued = 0;
    let suppressed = 0;

    for (const receiver of urgent.receivers) {
      const ping = await this.store.oncall.enqueueForDelivery({
        deliveryId: input.delivery.job.id,
        destinationId: destination.id,
        eventId: event.id,
        fingerprint: event.normalized.fingerprint,
        receiver,
        channel: URGENT_CHANNEL,
        providerReference: input.providerReference,
        trigger: "auto",
        dedupeWindowStartsAt,
        now,
      });

      if (ping) {
        queued += 1;
      } else {
        suppressed += 1;
      }
    }

    // Storm protection makes "nothing new to page" the common case, so the
    // suppression is a debug fact rather than a warning.
    oncallLogger.debug("Auto paging for {deliveryId} queued {queued} and suppressed {suppressed}", {
      deliveryId: input.delivery.job.id,
      destinationId: destination.id,
      eventId: event.id,
      severity: event.normalized.severity,
      queued,
      suppressed,
    });
  }
}
