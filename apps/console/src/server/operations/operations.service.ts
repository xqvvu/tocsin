import type { DeliveryDetail, DeliveryJob, DeliveryPingsResult } from "@tocsin/core";

import type {
  ListOperationsInput,
  OperationsList,
  OperationsServiceOptions,
} from "#/server/operations/operations.service.types";

export class OperationsService {
  private readonly store: OperationsServiceOptions["store"];
  private readonly oncall: OperationsServiceOptions["oncall"];

  constructor(options: OperationsServiceOptions) {
    this.store = options.store;
    this.oncall = options.oncall;
  }

  async listOperations(input: ListOperationsInput = {}): Promise<OperationsList> {
    const limit = input.limit ?? 20;
    const [events, deliveries] = await Promise.all([
      this.store.history.listEvents({
        limit,
        sourceId: input.sourceId,
        severity: input.severity,
        status: input.status,
        q: input.q,
        page: input.eventPage ?? 1,
      }),
      this.store.history.listDeliveries({
        limit,
        sourceId: input.sourceId,
        severity: input.severity,
        status: input.status,
        destinationId: input.destinationId,
        state: input.deliveryState,
        q: input.q,
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
