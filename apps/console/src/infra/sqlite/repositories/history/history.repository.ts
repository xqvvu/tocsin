import { sql } from "kysely";

import type { DeliveryListItem, EventDetail, EventListItem, NumberedPage } from "@tocsin/core";
import { decodeSchemaJson, evaluateRouteMatch, RouteMatchResultsSchema } from "@tocsin/core";
import type { RouteMatchProvenance } from "@tocsin/core";

import type { SqliteRepositoryContext } from "#/infra/sqlite/context";
import type { SqliteDeliveryRepository } from "#/infra/sqlite/repositories/delivery/delivery.repository";
import type { DestinationRepository } from "#/infra/sqlite/repositories/destination/destination.interface";
import {
  eventDetailDeliveryFromRow,
  type EventDetailDeliveryRow,
} from "#/infra/sqlite/repositories/history/history.helpers";
import type {
  DeliveryListQuery,
  EventListQuery,
  HistoryRepository,
} from "#/infra/sqlite/repositories/history/history.interface";
import {
  deliveryTargetKey,
  routeMatchGaps,
} from "#/infra/sqlite/repositories/history/route-match-gaps";
import { isPrunedRawPayload } from "#/infra/sqlite/repositories/intake/intake.helpers";
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
    private readonly destinations: DestinationRepository,
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
        sql<number>`SUM(CASE WHEN deliveries.state = 'suppressed' THEN 1 ELSE 0 END)`.as(
          "suppressed_count",
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

    if (query.since) {
      builder = builder.where("events.received_at", ">=", query.since);
    }

    if (query.q) {
      builder = builder.where(eventSearchPredicate(query.q));
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
          suppressed: row.suppressed_count ?? 0,
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
    // Two kinds of event reach here: those ingested with an intake snapshot, and
    // those written directly (replay fixtures, parser-failure audit records)
    // which carry none. Recomputing against the *current* route definitions is a
    // perfectly good fallback, but it is not the same claim as "this is what the
    // rules said at the time" — so the caller is told which one it got.
    const routeMatchesProvenance: RouteMatchProvenance =
      event.routeMatches === null ? "recomputed" : "intake_snapshot";
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

    // Explain the pairs the snapshot matched but which produced no delivery.
    //
    // Read-only by construction: it reads current routes/destinations plus the
    // event's own deliveries and (briefly) its dedupe rows. Nothing is written,
    // so this cannot alter what the intake path decided.
    const [allRoutes, allDestinations, dedupeRows] = await Promise.all([
      this.routes.list(),
      this.destinations.list(),
      event.idempotencyKey
        ? this.context.db
            .selectFrom("delivery_dedupe_keys")
            .select(["route_id", "destination_id", "first_event_id"])
            .where("idempotency_key", "=", event.idempotencyKey)
            .where("source_id", "=", event.sourceId)
            .execute()
        : Promise.resolve([]),
    ]);

    const gaps = routeMatchGaps({
      matches: routeMatches,
      deliveries,
      routes: allRoutes.map((route) => ({ id: route.id, enabled: route.enabled })),
      destinations: allDestinations.map((destination) => ({
        id: destination.id,
        name: destination.name,
        enabled: destination.enabled,
      })),
      dedupeFirstEvents: new Map(
        dedupeRows.map((row) => [
          deliveryTargetKey(row.route_id, row.destination_id),
          row.first_event_id,
        ]),
      ),
    });

    return {
      event,
      rawPayloadPruned: isPrunedRawPayload(event.rawPayload),
      source,
      routeMatches,
      routeMatchesProvenance,
      routeMatchGaps: gaps,
      deliveries,
    };
  }

  async listDeliveries(query: DeliveryListQuery = {}): Promise<NumberedPage<DeliveryListItem>> {
    const pageSize = Math.max(query.limit ?? 50, 1);
    const total = await this.countDeliveries(query);
    const pageCount = Math.max(Math.ceil(total / pageSize), 1);
    const page = Math.min(Math.max(query.page ?? 1, 1), pageCount);
    const offset = (page - 1) * pageSize;
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
        "destinations.kind as destination_kind",
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

    if (query.destinationId) {
      builder = builder.where("deliveries.destination_id", "=", query.destinationId);
    }

    if (query.routeId) {
      builder = builder.where("deliveries.route_id", "=", query.routeId);
    }

    if (query.suppressionId) {
      builder = builder.where("deliveries.suppression_id", "=", query.suppressionId);
    }

    if (query.state) {
      builder = builder.where("deliveries.state", "=", query.state);
    }

    if (query.since) {
      builder = builder.where("deliveries.created_at", ">=", query.since);
    }

    if (query.q) {
      builder = builder.where(eventSearchPredicate(query.q));
    }

    const rows = await builder.execute();

    return {
      items: rows.map((row) => ({
        id: row.id,
        eventId: row.event_id,
        sourceName: row.source_name,
        destinationName: row.destination_name,
        destinationKind: row.destination_kind ?? undefined,
        routeName: row.route_name,
        state: row.state,
        attemptCount: row.attempt_count,
        nextAttemptAt: row.next_attempt_at,
        lastError: row.last_error,
        updatedAt: row.updated_at,
      })),
      total,
      page,
      pageSize,
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

    if (query.since) {
      builder = builder.where("events.received_at", ">=", query.since);
    }

    if (query.q) {
      builder = builder.where(eventSearchPredicate(query.q));
    }

    const row = await builder.executeTakeFirst();

    return row?.total ?? 0;
  }

  /**
   * Counts the deliveries matching the same filters the page query applies.
   *
   * The filters live here rather than sharing a builder with `listDeliveries`
   * because the two queries differ in shape: the list joins `events`,
   * `sources`, `destinations` and `routes` to project display fields, while the
   * count only needs the joins its filters actually reference. Keeping them
   * separate mirrors `countEvents` and avoids counting duplicated rows through
   * a join the count does not need.
   */
  private async countDeliveries(query: DeliveryListQuery): Promise<number> {
    let builder = this.context.db
      .selectFrom("deliveries")
      .innerJoin("events", "events.id", "deliveries.event_id")
      .select(sql<number>`COUNT(*)`.as("total"));

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

    if (query.routeId) {
      builder = builder.where("deliveries.route_id", "=", query.routeId);
    }

    if (query.suppressionId) {
      builder = builder.where("deliveries.suppression_id", "=", query.suppressionId);
    }

    if (query.state) {
      builder = builder.where("deliveries.state", "=", query.state);
    }

    if (query.since) {
      builder = builder.where("deliveries.created_at", ">=", query.since);
    }

    if (query.q) {
      builder = builder.where(eventSearchPredicate(query.q));
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

/**
 * The search box searches title, message, and fingerprint
 * (`operations.filters.searchPlaceholder`). Every list and count query shares
 * this one predicate so a page and its `total` cannot disagree.
 */
function eventSearchPredicate(term: string) {
  const pattern = escapeLikeTerm(term);

  return sql<boolean>`(
    events.title LIKE ${pattern} ESCAPE '\\'
    OR events.message LIKE ${pattern} ESCAPE '\\'
    OR events.fingerprint LIKE ${pattern} ESCAPE '\\'
  )`;
}

/**
 * SQLite reads `%` and `_` as wildcards and `\` as the escape character. The
 * operator search is a literal substring search, so escape all three before
 * wrapping the term; otherwise `%` matches every row and `cpu_high` also
 * matches `cpu-high`.
 */
function escapeLikeTerm(term: string): string {
  return `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}
