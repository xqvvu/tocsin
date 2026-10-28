import {
  evaluateRouteMatch,
  findMatchingRoutes,
  PreviewRouteReplayCommandSchema,
  redactRouteMatchResults,
  redactText,
  ReplayRouteEventsCommandSchema,
  ReplayEventCommandSchema,
  type EventRecord,
  type EventReplayPreview,
  type EventReplayResult,
  type EventReplayTarget,
  type PreviewRouteReplayCommand,
  type ReplayEventCommand,
  type ReplayRouteEventsCommand,
  type RouteDefinition,
  type RouteMatchResult,
  type RouteReplayCandidate,
  type RouteReplayPreview,
  type RouteReplayResult,
  type ReplayUrgentPagingDestination,
  type ReplayUrgentPagingImpact,
} from "@tocsin/core";
import { feishuUrgentPagingReceivers } from "@tocsin/destinations/feishu";

import type { EnqueueDeliveriesResult } from "#/infra/sqlite/repositories/delivery/delivery.interface";
import type { DestinationRuntimeConfig } from "#/infra/sqlite/repositories/destination/destination.interface";
import type { SqliteStoreUnitOfWork } from "#/infra/sqlite/store";
import type { EventReplayServiceOptions } from "#/server/operations/event-replay.service.types";

export class EventReplayService {
  private readonly store: EventReplayServiceOptions["store"];
  private readonly now: () => string;
  private readonly dedupeWindowMs: number;

  constructor(options: EventReplayServiceOptions) {
    this.store = options.store;
    this.now = options.now ?? (() => new Date().toISOString());
    this.dedupeWindowMs = options.dedupeWindowMs ?? 5 * 60 * 1000;
  }

  async previewEventReplay(command: ReplayEventCommand): Promise<EventReplayPreview | null> {
    const input = ReplayEventCommandSchema.parse(command);
    const event = await this.store.intake.get(input.eventId);

    if (!event) {
      return null;
    }

    const routeMatches = await this.currentRouteMatches(this.store, event);
    const destinations = await this.destinationIndex(this.store);

    return this.buildPreview(this.store, event, routeMatches, null, destinations);
  }

  async replayEvent(command: ReplayEventCommand): Promise<EventReplayResult | null> {
    const input = ReplayEventCommandSchema.parse(command);

    return this.store.transaction(async (tx) => {
      const event = await tx.intake.get(input.eventId);

      if (!event) {
        return null;
      }

      const routeMatches = await this.currentRouteMatches(tx, event);
      const matchedRoutes = routeMatches.filter((match) => match.matched);
      const now = this.now();
      const enqueue = await tx.deliveries.enqueueForEvent({
        event,
        matches: matchedRoutes.map((match) => ({
          routeId: match.routeId,
          destinationIds: match.destinationIds,
        })),
        dedupeWindowStartsAt: new Date(new Date(now).valueOf() - this.dedupeWindowMs).toISOString(),
        now,
        dedupeByIdempotency: false,
        skipExistingForEvent: true,
      });
      const preview = await this.buildPreview(
        tx,
        event,
        routeMatches,
        enqueue,
        await this.destinationIndex(tx),
      );

      return {
        ...preview,
        createdDeliveryIds: enqueue.created.map((delivery) => delivery.id),
        skippedExistingCount: enqueue.skippedExisting.length,
      };
    });
  }

  async previewRouteReplay(command: PreviewRouteReplayCommand): Promise<RouteReplayPreview | null> {
    const input = PreviewRouteReplayCommandSchema.parse(command);
    const route = await this.store.routes.get(input.routeId);

    if (!route) {
      return null;
    }

    return this.buildRoutePreview(this.store, route, input.limit);
  }

  async replayRouteEvents(command: ReplayRouteEventsCommand): Promise<RouteReplayResult | null> {
    const input = ReplayRouteEventsCommandSchema.parse(command);

    return this.store.transaction(async (tx) => {
      const route = await tx.routes.get(input.routeId);

      if (!route) {
        return null;
      }

      if (!route.enabled) {
        return {
          routeId: route.id,
          routeName: route.name,
          enabled: false,
          eventCount: 0,
          createdDeliveryIds: [],
          skippedExistingCount: 0,
        };
      }

      const now = this.now();
      const createdDeliveryIds: string[] = [];
      let skippedExistingCount = 0;
      let eventCount = 0;

      for (const eventId of input.eventIds) {
        const event = await tx.intake.get(eventId);

        if (!event) {
          continue;
        }

        const match = evaluateRouteMatch(route, {
          sourceId: event.sourceId,
          event: event.normalized,
        });

        if (!match.matched) {
          continue;
        }

        eventCount += 1;
        const enqueue = await tx.deliveries.enqueueForEvent({
          event,
          matches: [{ routeId: route.id, destinationIds: route.destinationIds }],
          dedupeWindowStartsAt: new Date(
            new Date(now).valueOf() - this.dedupeWindowMs,
          ).toISOString(),
          now,
          dedupeByIdempotency: false,
          skipExistingForEvent: true,
        });

        createdDeliveryIds.push(...enqueue.created.map((delivery) => delivery.id));
        skippedExistingCount += enqueue.skippedExisting.length;
      }

      return {
        routeId: route.id,
        routeName: route.name,
        enabled: true,
        eventCount,
        createdDeliveryIds,
        skippedExistingCount,
      };
    });
  }

  private async currentRouteMatches(
    store: Pick<SqliteStoreUnitOfWork, "routes">,
    event: EventRecord,
  ): Promise<RouteMatchResult[]> {
    return findMatchingRoutes(await store.routes.list(), {
      sourceId: event.sourceId,
      event: event.normalized,
    });
  }

  private async buildPreview(
    store: Pick<SqliteStoreUnitOfWork, "history">,
    event: EventRecord,
    routeMatches: RouteMatchResult[],
    enqueue: EnqueueDeliveriesResult | null,
    destinations: Map<string, DestinationRuntimeConfig>,
  ): Promise<EventReplayPreview> {
    const targets = await this.eventReplayTargets(store, event, routeMatches, enqueue);
    const existingDeliveryCount = targets.filter((target) => target.alreadyExists).length;

    return {
      eventId: event.id,
      // The preview is a DTO; matching above and replay below keep the raw
      // result so a redacted label cannot change which routes match.
      routeMatches: redactRouteMatchResults(routeMatches),
      targets,
      matchedRouteCount: routeMatches.length,
      newDeliveryCount: targets.length - existingDeliveryCount,
      existingDeliveryCount,
      urgentPaging: urgentPagingImpact(event, targets, destinations),
    };
  }

  private async destinationIndex(
    store: Pick<SqliteStoreUnitOfWork, "destinations">,
  ): Promise<Map<string, DestinationRuntimeConfig>> {
    return new Map(
      (await store.destinations.list()).map((destination) => [destination.id, destination]),
    );
  }

  private async buildRoutePreview(
    store: Pick<SqliteStoreUnitOfWork, "destinations" | "history" | "intake" | "sources">,
    route: RouteDefinition,
    limit: number,
  ): Promise<RouteReplayPreview> {
    const events = route.enabled ? await store.intake.listRecent({ limit }) : [];
    const destinations = await this.destinationIndex(store);
    const candidates: RouteReplayCandidate[] = [];
    const urgentImpacts: ReplayUrgentPagingImpact[] = [];
    let matchedEventCount = 0;

    for (const event of events) {
      const match = evaluateRouteMatch(route, {
        sourceId: event.sourceId,
        event: event.normalized,
      });

      if (!match.matched) {
        continue;
      }

      matchedEventCount += 1;

      const preview = await this.buildPreview(store, event, [match], null, destinations);

      if (preview.newDeliveryCount === 0) {
        continue;
      }

      urgentImpacts.push(preview.urgentPaging);
      candidates.push({
        event: await routeReplayEventSummary(store, event),
        targets: preview.targets,
        newDeliveryCount: preview.newDeliveryCount,
        existingDeliveryCount: preview.existingDeliveryCount,
      });
    }

    return {
      routeId: route.id,
      routeName: route.name,
      enabled: route.enabled,
      limit,
      scannedEventCount: events.length,
      matchedEventCount,
      candidates,
      newDeliveryCount: candidates.reduce(
        (total, candidate) => total + candidate.newDeliveryCount,
        0,
      ),
      existingDeliveryCount: candidates.reduce(
        (total, candidate) => total + candidate.existingDeliveryCount,
        0,
      ),
      urgentPaging: mergedUrgentPaging(urgentImpacts),
    };
  }

  private async eventReplayTargets(
    store: Pick<SqliteStoreUnitOfWork, "history">,
    event: EventRecord,
    routeMatches: RouteMatchResult[],
    enqueue: EnqueueDeliveriesResult | null,
  ): Promise<EventReplayTarget[]> {
    const existingByTarget =
      enqueue === null ? await listExistingTargetsFromHistory(store, event.id) : new Map();
    const createdByTarget = new Map(
      enqueue?.created.map((delivery) => [
        deliveryTargetKey(delivery.routeId ?? "", delivery.destinationId),
        delivery.id,
      ]) ?? [],
    );
    const skippedByTarget = new Map(
      enqueue?.skippedExisting.map((target) => [
        deliveryTargetKey(target.routeId, target.destinationId),
        target.deliveryId,
      ]) ?? [],
    );

    return routeMatches.flatMap((match) =>
      match.destinationIds.map((destinationId) => {
        const key = deliveryTargetKey(match.routeId, destinationId);
        const createdDeliveryId = createdByTarget.get(key) ?? null;
        const skippedDeliveryId = skippedByTarget.get(key) ?? existingByTarget.get(key) ?? null;

        return {
          routeId: match.routeId,
          routeName: match.routeName,
          destinationId,
          deliveryId: createdDeliveryId ?? skippedDeliveryId,
          alreadyExists: skippedDeliveryId !== null,
        };
      }),
    );
  }
}

function deliveryTargetKey(routeId: string, destinationId: string): string {
  return `${routeId}\u0000${destinationId}`;
}

async function listExistingTargetsFromHistory(
  store: Pick<SqliteStoreUnitOfWork, "history">,
  eventId: string,
): Promise<Map<string, string>> {
  const detail = await store.history.getEventDetail(eventId);

  return new Map(
    detail?.deliveries
      .filter((delivery) => delivery.routeId !== null)
      .map((delivery) => [
        deliveryTargetKey(delivery.routeId ?? "", delivery.destinationId),
        delivery.id,
      ]) ?? [],
  );
}

async function routeReplayEventSummary(
  store: Pick<SqliteStoreUnitOfWork, "sources">,
  event: EventRecord,
) {
  const source = await store.sources.get(event.sourceId);

  return {
    id: event.id,
    sourceId: event.sourceId,
    sourceName: source?.name ?? event.sourceId,
    severity: event.normalized.severity,
    status: event.normalized.status,
    title: redactText(event.normalized.title),
    fingerprint: event.normalized.fingerprint,
    receivedAt: event.receivedAt,
  };
}

/**
 * Who a replay could page, derived from the same automatic paging gate the
 * delivery trigger uses. Only new deliveries to enabled destinations count:
 * an existing target is skipped by replay, and a disabled destination never
 * reaches the worker.
 */
function urgentPagingImpact(
  event: EventRecord,
  targets: EventReplayTarget[],
  destinations: Map<string, DestinationRuntimeConfig>,
): ReplayUrgentPagingImpact {
  const byDestination = new Map<string, ReplayUrgentPagingDestination>();
  let deliveryCount = 0;
  let receiverCount = 0;

  for (const target of targets) {
    if (target.alreadyExists) {
      continue;
    }

    const destination = destinations.get(target.destinationId);

    if (!destination || !destination.enabled) {
      continue;
    }

    const receivers = feishuUrgentPagingReceivers({
      config: destination.config,
      status: event.normalized.status,
      severity: event.normalized.severity,
    });

    if (receivers.length === 0) {
      continue;
    }

    deliveryCount += 1;
    receiverCount += receivers.length;

    const existing = byDestination.get(destination.id);

    if (existing) {
      existing.receiverCount += receivers.length;
    } else {
      byDestination.set(destination.id, {
        destinationId: destination.id,
        destinationName: destination.name,
        receiverCount: receivers.length,
      });
    }
  }

  return {
    destinations: sortedUrgentDestinations(byDestination),
    deliveryCount,
    receiverCount,
  };
}

/** Roll per-event impacts up for the route replay preview. */
function mergedUrgentPaging(impacts: ReplayUrgentPagingImpact[]): ReplayUrgentPagingImpact {
  const byDestination = new Map<string, ReplayUrgentPagingDestination>();
  let deliveryCount = 0;
  let receiverCount = 0;

  for (const impact of impacts) {
    deliveryCount += impact.deliveryCount;
    receiverCount += impact.receiverCount;

    for (const destination of impact.destinations) {
      const existing = byDestination.get(destination.destinationId);

      if (existing) {
        existing.receiverCount += destination.receiverCount;
      } else {
        byDestination.set(destination.destinationId, { ...destination });
      }
    }
  }

  return {
    destinations: sortedUrgentDestinations(byDestination),
    deliveryCount,
    receiverCount,
  };
}

function sortedUrgentDestinations(
  byDestination: Map<string, ReplayUrgentPagingDestination>,
): ReplayUrgentPagingDestination[] {
  return [...byDestination.values()].sort(
    (left, right) =>
      right.receiverCount - left.receiverCount ||
      left.destinationName.localeCompare(right.destinationName),
  );
}
