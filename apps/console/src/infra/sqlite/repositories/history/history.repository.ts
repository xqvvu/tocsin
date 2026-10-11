import { sql } from "kysely";

import type { DeliveryListItem, EventDetail, EventListItem, NumberedPage } from "@tocsin/core";
import { decodeSchemaJson, evaluateRouteMatch, RouteMatchResultsSchema } from "@tocsin/core";
import type { Page } from "@tocsin/core";

import type { SqliteRepositoryContext } from "#/infra/sqlite/context";
import type { SqliteDeliveryRepository } from "#/infra/sqlite/repositories/delivery/delivery.repository";
import {
  decodeHistoryCursor,
  encodeHistoryCursor,
  eventDetailDeliveryFromRow,
  type EventDetailDeliveryRow,
} from "#/infra/sqlite/repositories/history/history.helpers";
import type {
  DeliveryListQuery,
  EventListQuery,
  HistoryRepository,
} from "#/infra/sqlite/repositories/history/history.interface";
import type { SqliteIntakeRepository } from "#/infra/sqlite/repositories/intake/intake.repository";
import type { RouteRepository } from "#/infra/sqlite/repositories/route/route.interface";
import {
  requireSource,
  sourceSummaryFromRuntime,
} from "#/infra/sqlite/repositories/source/source.helpers";
import type { SourceRepository } from "#/infra/sqlite/repositories/source/source.interface";

export class SqliteHistoryRepository implements HistoryRepository {
  constructor(
    private readonly context: SqliteRepositoryContext,
    private readonly sources: SourceRepository,
    private readonly intake: SqliteIntakeRepository,
    private readonly routes: RouteRepository,
    _deliveries: SqliteDeliveryRepository,
  ) {}

  async listEvents(query: EventListQuery = {}): Promise<NumberedPage<EventListItem>> {
    const pageSize = Math.max(query.limit ?? 50, 1);
    const total = await this.countEvents(query);
    const pageCount = Math.max(Math.ceil(total / pageSize), 1);
    const page = Math.min(Math.max(query.page ?? 1, 1), pageCount);
    const offset = (page - 1) * pageSize;
    let builder = this.context.db
      .selectFrom("events")
      .innerJoin("sources", "sources.id", "events.source_id")
      .leftJoin("deliveries", "deliveries.event_id", "events.id")
      .select([
        "events.id as id",
        "events.source_id as source_id",
        "sources.name as source_name",
        "events.severity as severity",
        "events.status as status",
        "events.title as title",
        "events.fingerprint as fingerprint",
        "events.route_matches_json as route_matches_json",
        "events.received_at as received_at",
        sql<number>`SUM(CASE WHEN deliveries.state = 'pending' THEN 1 ELSE 0 END)`.as(
          "pending_count",
        ),
        sql<number>`SUM(CASE WHEN deliveries.state = 'running' THEN 1 ELSE 0 END)`.as(
          "running_count",
        ),
        sql<number>`SUM(CASE WHEN deliveries.state = 'succeeded' THEN 1 ELSE 0 END)`.as(
          "succeeded_count",
        ),
        sql<number>`SUM(CASE WHEN deliveries.state = 'failed' THEN 1 ELSE 0 END)`.as(
          "failed_count",
        ),
      ])
      .groupBy("events.id")
      .orderBy("events.received_at", "desc")
      .orderBy("events.id", "desc")
      .limit(pageSize)
      .offset(offset);

    if (query.sourceId) {
      builder = builder.where("events.source_id", "=", query.sourceId);
    }

    if (query.severity) {
      builder = builder.where("events.severity", "=", query.severity);
    }

    if (query.status) {
      builder = builder.where("events.status", "=", query.status);
    }

    if (query.q) {
      const q = `%${query.q}%`;

      builder = builder.where((eb) =>
        eb.or([eb("events.title", "like", q), eb("events.message", "like", q)]),
      );
    }

    const rows = await builder.execute();

    return {
      items: rows.map((row) => ({
        id: row.id,
        sourceId: row.source_id,
        sourceName: row.source_name,
        severity: row.severity,
        status: row.status,
        title: row.title,
        fingerprint: row.fingerprint,
        receivedAt: row.received_at,
        routeMatchCount: countMatchedRoutes(row.route_matches_json),
        deliveryCounts: {
          pending: row.pending_count ?? 0,
          running: row.running_count ?? 0,
          succeeded: row.succeeded_count ?? 0,
          failed: row.failed_count ?? 0,
        },
      })),
      total,
      page,
      pageSize,
    };
  }

  async getEventDetail(eventId: string): Promise<EventDetail | null> {
    const event = await this.intake.get(eventId);

    if (!event) {
      return null;
    }

    const source = sourceSummaryFromRuntime(requireSource(await this.sources.get(event.sourceId)));
    const routeMatches =
      event.routeMatches ??
      (await this.routes.list()).map((route) =>
        evaluateRouteMatch(route, {
          sourceId: event.sourceId,
          event: event.normalized,
        }),
      );
    const deliveries = (
      await this.context.db
        .selectFrom("deliveries")
        .innerJoin("destinations", "destinations.id", "deliveries.destination_id")
        .leftJoin("routes", "routes.id", "deliveries.route_id")
        .selectAll("deliveries")
        .select(["destinations.name as destination_name", "routes.name as route_name"])
        .where("deliveries.event_id", "=", eventId)
        .orderBy("deliveries.created_at")
        .execute()
    ).map((row) => eventDetailDeliveryFromRow(row as EventDetailDeliveryRow));

    return { event, source, routeMatches, deliveries };
  }

  async listDeliveries(query: DeliveryListQuery = {}): Promise<Page<DeliveryListItem>> {
    const limit = query.limit ?? 50;
    let builder = this.context.db
      .selectFrom("deliveries")
      .innerJoin("events", "events.id", "deliveries.event_id")
      .innerJoin("sources", "sources.id", "events.source_id")
      .innerJoin("destinations", "destinations.id", "deliveries.destination_id")
      .leftJoin("routes", "routes.id", "deliveries.route_id")
      .select([
        "deliveries.id as id",
        "deliveries.event_id as event_id",
        "sources.name as source_name",
        "destinations.name as destination_name",
        "routes.name as route_name",
        "deliveries.state as state",
        "deliveries.attempt_count as attempt_count",
        "deliveries.next_attempt_at as next_attempt_at",
        "deliveries.last_error as last_error",
        "deliveries.created_at as created_at",
        "deliveries.updated_at as updated_at",
      ])
      .orderBy("deliveries.created_at", "desc")
      .orderBy("deliveries.id", "desc")
      .limit(limit + 1);

    if (query.sourceId) {
      builder = builder.where("events.source_id", "=", query.sourceId);
    }

    if (query.severity) {
      builder = builder.where("events.severity", "=", query.severity);
    }

    if (query.status) {
      builder = builder.where("events.status", "=", query.status);
    }

    if (query.destinationId) {
      builder = builder.where("deliveries.destination_id", "=", query.destinationId);
    }

    if (query.state) {
      builder = builder.where("deliveries.state", "=", query.state);
    }

    if (query.q) {
      const q = `%${query.q}%`;

      builder = builder.where((eb) =>
        eb.or([eb("events.title", "like", q), eb("events.message", "like", q)]),
      );
    }

    if (query.cursor) {
      const cursor = decodeHistoryCursor(query.cursor);

      if (cursor.id) {
        builder = builder.where((eb) =>
          eb.or([
            eb("deliveries.created_at", "<", cursor.time),
            eb.and([
              eb("deliveries.created_at", "=", cursor.time),
              eb("deliveries.id", "<", cursor.id),
            ]),
          ]),
        );
      } else {
        builder = builder.where("deliveries.created_at", "<", cursor.time);
      }
    }

    const rows = await builder.execute();
    const pageRows = rows.slice(0, limit);

    return {
      items: pageRows.map((row) => ({
        id: row.id,
        eventId: row.event_id,
        sourceName: row.source_name,
        destinationName: row.destination_name,
        routeName: row.route_name,
        state: row.state,
        attemptCount: row.attempt_count,
        nextAttemptAt: row.next_attempt_at,
        lastError: row.last_error,
        updatedAt: row.updated_at,
      })),
      nextCursor:
        rows.length > limit && pageRows.at(-1)
          ? encodeHistoryCursor(pageRows.at(-1)!.created_at, pageRows.at(-1)!.id)
          : null,
    };
  }

  private async countEvents(query: EventListQuery): Promise<number> {
    let builder = this.context.db.selectFrom("events").select(sql<number>`COUNT(*)`.as("total"));

    if (query.sourceId) {
      builder = builder.where("events.source_id", "=", query.sourceId);
    }

    if (query.severity) {
      builder = builder.where("events.severity", "=", query.severity);
    }

    if (query.status) {
      builder = builder.where("events.status", "=", query.status);
    }

    if (query.q) {
      const q = `%${query.q}%`;

      builder = builder.where((eb) =>
        eb.or([eb("events.title", "like", q), eb("events.message", "like", q)]),
      );
    }

    const row = await builder.executeTakeFirst();

    return row?.total ?? 0;
  }
}

function countMatchedRoutes(routeMatchesJson: string | null): number {
  if (routeMatchesJson === null) {
    return 0;
  }

  return decodeSchemaJson(RouteMatchResultsSchema, routeMatchesJson).filter(
    (match) => match.matched,
  ).length;
}
