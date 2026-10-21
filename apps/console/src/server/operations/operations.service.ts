import type {
  DeliveryDetail,
  DeliveryJob,
  DeliveryPingsResult,
  OperationTimeRange,
} from "@tocsin/core";

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
    const since = timeRangeSince(input.range, this.now());
    const [events, deliveries] = await Promise.all([
      this.store.history.listEvents({
        limit,
        sourceId: input.sourceId,
        severity: input.severity,
        status: input.status,
        q: input.q,
        since,
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
        state: input.deliveryState,
        q: input.q,
        since,
        page: input.deliveryPage ?? 1,
      }),
    ]);

    return { events, deliveries };
  }

  async getEventDetail(eventId: string) {
    return this.store.history.getEventDetail(eventId);
  }

  async getDeliveryDetail(deliveryId: string): Promise<DeliveryDetail | null> {
    return this.store.deliveries.get(deliveryId);
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
 */
function timeRangeSince(range: OperationTimeRange | undefined, now: Date): string | undefined {
  if (!range) {
    return undefined;
  }

  return new Date(now.getTime() - TIME_RANGE_MS[range]).toISOString();
}
