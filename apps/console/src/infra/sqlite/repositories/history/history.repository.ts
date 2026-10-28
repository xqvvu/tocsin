import { sql } from "kysely";

import type {
  DeliveryListItem,
  DeliveryReceiptFilter,
  DeliveryTimeField,
  DeletionImpact,
  DestinationKind,
  EventDeliveryOutcome,
  EventDestinationMatch,
  EventDetail,
  EventFingerprintContext,
  EventListItem,
  NumberedPage,
} from "@tocsin/core";
import {
  decodeSchemaJson,
  evaluateRouteMatch,
  redactEventRecord,
  redactRouteMatchResults,
  redactText,
  RouteMatchResultsSchema,
  splitOperationSearchTerms,
} from "@tocsin/core";
import type { RouteMatchProvenance } from "@tocsin/core";

import type { SqliteRepositoryContext } from "#/infra/sqlite/context";
import {
  providerReferenceFromRow,
  redactNullableText,
} from "#/infra/sqlite/repositories/delivery/delivery.helpers";
import type { SqliteDeliveryRepository } from "#/infra/sqlite/repositories/delivery/delivery.repository";
import type { DestinationRepository } from "#/infra/sqlite/repositories/destination/destination.interface";
import {
  eventDetailDeliveryFromRow,
  type EventDetailDeliveryRow,
  type EventDetailLatestAttempt,
  fingerprintChangesFrom,
  fingerprintOccurrence,
  isParseFailureRow,
  redactedFingerprintFields,
} from "#/infra/sqlite/repositories/history/history.helpers";
import type {
  DeliveryListQuery,
  DeletionImpactTarget,
  DestinationDeliveryHealthQuery,
  DestinationDeliveryHealthRow,
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
        "events.provider_metadata_json as provider_metadata_json",
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

    if (query.deliveryOutcome) {
      builder = builder.where(eventDeliveryOutcomePredicate(query.deliveryOutcome));
    }

    if (query.destinationId) {
      builder = builder.where(
        eventDestinationPredicate(query.destinationId, query.destinationMatch ?? "delivered"),
      );
    }

    if (query.since) {
      builder = builder.where("events.received_at", ">=", query.since);
    }

    if (query.until) {
      // Exclusive: rows received at exactly the captured instant were not part
      // of the first page, so they belong outside the frozen walk.
      builder = builder.where("events.received_at", "<", query.until);
    }

    if (query.fingerprint) {
      // Equality, not LIKE: the recurrence view asks for one alert identity,
      // and a substring match here would mix in every unrelated alert whose
      // text happens to contain the same characters. `idx_events_fingerprint_received_at`
      // covers the lookup and the list's `received_at` ordering.
      builder = builder.where("events.fingerprint", "=", query.fingerprint);
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
        // Provider-authored copy can carry a credential pasted into the alert;
        // matching already happened against the raw value at intake.
        title: redactText(row.title),
        fingerprint: row.fingerprint,
        receivedAt: row.received_at,
        parseFailed: isParseFailureRow(row.provider_metadata_json),
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
    const deliveryRows = await this.context.db
      .selectFrom("deliveries")
      .innerJoin("destinations", "destinations.id", "deliveries.destination_id")
      .leftJoin("routes", "routes.id", "deliveries.route_id")
      .selectAll("deliveries")
      .select([
        "destinations.name as destination_name",
        "destinations.kind as destination_kind",
        "routes.name as route_name",
      ])
      .where("deliveries.event_id", "=", eventId)
      .orderBy("deliveries.created_at")
      .execute();
    // The receipt for each delivery is its latest completed attempt. One
    // grouped read keeps the detail page at a fixed query count; `running`
    // attempts are excluded because they have no response yet.
    const latestAttempts = await this.latestAttemptsByDelivery(deliveryRows.map((row) => row.id));
    const deliveries = deliveryRows.map((row) =>
      eventDetailDeliveryFromRow(row as EventDetailDeliveryRow, latestAttempts.get(row.id) ?? null),
    );

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
      // The detail is a DTO, not the matching input: replay and gap analysis
      // above already read the raw event and raw route results.
      event: redactEventRecord(event),
      rawPayloadPruned: isPrunedRawPayload(event.rawPayload),
      source,
      routeMatches: redactRouteMatchResults(routeMatches),
      routeMatchesProvenance,
      routeMatchGaps: gaps,
      deliveries,
    };
  }

  /**
   * Earlier occurrences of the same fingerprint on the same source.
   *
   * A fingerprint is only meaningful inside the provider that produced it, so
   * both reads filter on `source_id` as well: two vendors can legitimately
   * emit the same string for unrelated alerts. The page is bounded to five
   * rows and the count is a separate aggregate, which keeps the query cost
   * independent of how long the alert has been firing.
   *
   * `received_at <= current` plus an id exclusion (rather than a strict `<`)
   * keeps a sibling written in the same millisecond; ordering by time and then
   * id keeps the page deterministic for those ties.
   */
  async getEventFingerprintContext(eventId: string): Promise<EventFingerprintContext | null> {
    const columns = [
      "id",
      "source_id",
      "title",
      "message",
      "severity",
      "status",
      "labels_json",
      "fingerprint",
      "received_at",
    ] as const;

    const currentRow = await this.context.db
      .selectFrom("events")
      .select(columns)
      .where("id", "=", eventId)
      .executeTakeFirst();

    if (!currentRow) {
      return null;
    }

    const earlierRows = await this.context.db
      .selectFrom("events")
      .select(columns)
      .where("source_id", "=", currentRow.source_id)
      .where("fingerprint", "=", currentRow.fingerprint)
      .where("id", "!=", eventId)
      .where("received_at", "<=", currentRow.received_at)
      .orderBy("received_at", "desc")
      .orderBy("id", "desc")
      .limit(5)
      .execute();

    const countRow = await this.context.db
      .selectFrom("events")
      .select(sql<number>`COUNT(*)`.as("total"))
      .where("source_id", "=", currentRow.source_id)
      .where("fingerprint", "=", currentRow.fingerprint)
      .where("id", "!=", eventId)
      .where("received_at", "<=", currentRow.received_at)
      .executeTakeFirst();

    const currentFields = redactedFingerprintFields(currentRow);
    const earlierFields = earlierRows.map((row) => redactedFingerprintFields(row));
    const previous = earlierFields[0] ?? null;

    return {
      fingerprint: currentRow.fingerprint,
      earlierCount: countRow?.total ?? 0,
      previous: previous ? fingerprintOccurrence(previous) : null,
      recent: earlierFields.map((fields) => fingerprintOccurrence(fields)),
      ...fingerprintChangesFrom(previous, currentFields),
    };
  }

  async listDeliveries(query: DeliveryListQuery = {}): Promise<NumberedPage<DeliveryListItem>> {
    const pageSize = Math.max(query.limit ?? 50, 1);
    const total = await this.countDeliveries(query);
    const pageCount = Math.max(Math.ceil(total / pageSize), 1);
    const page = Math.min(Math.max(query.page ?? 1, 1), pageCount);
    const offset = (page - 1) * pageSize;
    const timeColumn = deliveryTimeColumn(query.timeField);
    let builder = this.context.db
      .selectFrom("deliveries")
      .innerJoin("events", "events.id", "deliveries.event_id")
      .innerJoin("sources", "sources.id", "events.source_id")
      .innerJoin("destinations", "destinations.id", "deliveries.destination_id")
      .leftJoin("routes", "routes.id", "deliveries.route_id")
      .select([
        "deliveries.id as id",
        "deliveries.event_id as event_id",
        "events.title as event_title",
        "events.severity as event_severity",
        "events.status as event_status",
        "sources.name as source_name",
        "destinations.name as destination_name",
        "destinations.kind as destination_kind",
        "routes.name as route_name",
        "deliveries.provider_ref_type as provider_ref_type",
        "deliveries.provider_ref_value as provider_ref_value",
        "deliveries.state as state",
        "deliveries.attempt_count as attempt_count",
        "deliveries.max_attempts as max_attempts",
        "deliveries.next_attempt_at as next_attempt_at",
        "deliveries.last_error as last_error",
        "deliveries.created_at as created_at",
        "deliveries.updated_at as updated_at",
      ])
      .orderBy(timeColumn, "desc")
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

    if (query.destinationKind) {
      builder = builder.where(deliveryDestinationKindPredicate(query.destinationKind));
    }

    if (query.routeId) {
      builder = builder.where("deliveries.route_id", "=", query.routeId);
    }

    if (query.eventId) {
      builder = builder.where("deliveries.event_id", "=", query.eventId);
    }

    if (query.suppressionId) {
      builder = builder.where("deliveries.suppression_id", "=", query.suppressionId);
    }

    if (query.receipt) {
      builder = builder.where(deliveryReceiptPredicate(query.receipt));
    }

    if (query.state) {
      builder = builder.where("deliveries.state", "=", query.state);
    }

    if (query.minAttempts) {
      builder = builder.where("deliveries.attempt_count", ">=", query.minAttempts);
    }

    if (query.since) {
      builder = builder.where(timeColumn, ">=", query.since);
    }

    if (query.until) {
      builder = builder.where(timeColumn, "<", query.until);
    }

    if (query.q) {
      builder = builder.where(deliverySearchPredicate(query.q));
    }

    const rows = await builder.execute();

    return {
      items: rows.map((row) => ({
        id: row.id,
        eventId: row.event_id,
        eventTitle: redactText(row.event_title),
        eventSeverity: row.event_severity,
        eventStatus: row.event_status,
        sourceName: row.source_name,
        destinationName: row.destination_name,
        destinationKind: row.destination_kind ?? undefined,
        routeName: row.route_name,
        providerReference: providerReferenceFromRow(row),
        state: row.state,
        attemptCount: row.attempt_count,
        maxAttempts: row.max_attempts,
        nextAttemptAt: row.next_attempt_at,
        // Legacy rows may predate value-shape redaction, so re-check on read.
        lastError: redactNullableText(row.last_error),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      total,
      page,
      pageSize,
    };
  }

  async destinationDeliveryHealth(
    query: DestinationDeliveryHealthQuery,
  ): Promise<DestinationDeliveryHealthRow[]> {
    // One grouped pass over deliveries, not a query per destination.
    // `idx_deliveries_destination_id_health` covers every column read here, so
    // the planner scans index-only instead of building a temp B-tree. Delivery
    // rows have no retention/cleanup yet, so the scan cost still grows with the
    // table: the index lowers the constant, it does not bound growth.
    const rows = await this.context.db
      .selectFrom("deliveries")
      .select([
        "destination_id as destination_id",
        sql<string | null>`MAX(CASE WHEN state = 'succeeded' THEN finished_at END)`.as(
          "last_succeeded_at",
        ),
        sql<string | null>`MAX(CASE WHEN state = 'failed' THEN finished_at END)`.as(
          "last_failed_at",
        ),
        sql<number>`SUM(CASE WHEN state IN ('pending', 'running') THEN 1 ELSE 0 END)`.as(
          "queued_count",
        ),
        sql<number>`SUM(CASE WHEN state = 'failed' AND created_at >= ${query.since} THEN 1 ELSE 0 END)`.as(
          "recent_failure_count",
        ),
      ])
      .groupBy("destination_id")
      .execute();

    return rows.map((row) => ({
      destinationId: row.destination_id,
      lastSucceededAt: row.last_succeeded_at,
      lastFailedAt: row.last_failed_at,
      queuedCount: row.queued_count,
      recentFailureCount: row.recent_failure_count,
    }));
  }

  async countDeletionImpact(target: DeletionImpactTarget): Promise<DeletionImpact> {
    const db = this.context.db;

    if ("sourceId" in target) {
      // Deleting the source cascades through events, and every delivery,
      // attempt, and ping hangs off an event: walk the same path.
      const eventCount = await countAll(() =>
        db
          .selectFrom("events")
          .select((eb) => eb.fn.countAll<number>().as("count"))
          .where("source_id", "=", target.sourceId)
          .executeTakeFirst(),
      );
      const deliveryCount = await countAll(() =>
        db
          .selectFrom("deliveries")
          .innerJoin("events", "events.id", "deliveries.event_id")
          .select((eb) => eb.fn.countAll<number>().as("count"))
          .where("events.source_id", "=", target.sourceId)
          .executeTakeFirst(),
      );
      const attemptCount = await countAll(() =>
        db
          .selectFrom("delivery_attempts")
          .innerJoin("deliveries", "deliveries.id", "delivery_attempts.delivery_id")
          .innerJoin("events", "events.id", "deliveries.event_id")
          .select((eb) => eb.fn.countAll<number>().as("count"))
          .where("events.source_id", "=", target.sourceId)
          .executeTakeFirst(),
      );
      const oncallPingCount = await countAll(() =>
        db
          .selectFrom("oncall_pings")
          .innerJoin("events", "events.id", "oncall_pings.event_id")
          .select((eb) => eb.fn.countAll<number>().as("count"))
          .where("events.source_id", "=", target.sourceId)
          .executeTakeFirst(),
      );

      return { eventCount, deliveryCount, attemptCount, oncallPingCount };
    }

    if ("routeId" in target) {
      // Route deletes keep their events; only the fan-out they produced goes.
      const deliveryCount = await countAll(() =>
        db
          .selectFrom("deliveries")
          .select((eb) => eb.fn.countAll<number>().as("count"))
          .where("route_id", "=", target.routeId)
          .executeTakeFirst(),
      );
      const attemptCount = await countAll(() =>
        db
          .selectFrom("delivery_attempts")
          .innerJoin("deliveries", "deliveries.id", "delivery_attempts.delivery_id")
          .select((eb) => eb.fn.countAll<number>().as("count"))
          .where("deliveries.route_id", "=", target.routeId)
          .executeTakeFirst(),
      );
      const oncallPingCount = await countAll(() =>
        db
          .selectFrom("oncall_pings")
          .innerJoin("deliveries", "deliveries.id", "oncall_pings.delivery_id")
          .select((eb) => eb.fn.countAll<number>().as("count"))
          .where("deliveries.route_id", "=", target.routeId)
          .executeTakeFirst(),
      );

      return { eventCount: 0, deliveryCount, attemptCount, oncallPingCount };
    }

    // Destination deletes also keep their events.
    const deliveryCount = await countAll(() =>
      db
        .selectFrom("deliveries")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("destination_id", "=", target.destinationId)
        .executeTakeFirst(),
    );
    const attemptCount = await countAll(() =>
      db
        .selectFrom("delivery_attempts")
        .innerJoin("deliveries", "deliveries.id", "delivery_attempts.delivery_id")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("deliveries.destination_id", "=", target.destinationId)
        .executeTakeFirst(),
    );
    const oncallPingCount = await countAll(() =>
      db
        .selectFrom("oncall_pings")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("destination_id", "=", target.destinationId)
        .executeTakeFirst(),
    );

    return { eventCount: 0, deliveryCount, attemptCount, oncallPingCount };
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

    if (query.deliveryOutcome) {
      builder = builder.where(eventDeliveryOutcomePredicate(query.deliveryOutcome));
    }

    if (query.destinationId) {
      builder = builder.where(
        eventDestinationPredicate(query.destinationId, query.destinationMatch ?? "delivered"),
      );
    }

    if (query.since) {
      builder = builder.where("events.received_at", ">=", query.since);
    }

    if (query.until) {
      // Exclusive: rows received at exactly the captured instant were not part
      // of the first page, so they belong outside the frozen walk.
      builder = builder.where("events.received_at", "<", query.until);
    }

    if (query.fingerprint) {
      // Equality, not LIKE: the recurrence view asks for one alert identity,
      // and a substring match here would mix in every unrelated alert whose
      // text happens to contain the same characters. `idx_events_fingerprint_received_at`
      // covers the lookup and the list's `received_at` ordering.
      builder = builder.where("events.fingerprint", "=", query.fingerprint);
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
    const timeColumn = deliveryTimeColumn(query.timeField);
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

    if (query.destinationKind) {
      builder = builder.where(deliveryDestinationKindPredicate(query.destinationKind));
    }

    if (query.routeId) {
      builder = builder.where("deliveries.route_id", "=", query.routeId);
    }

    if (query.eventId) {
      builder = builder.where("deliveries.event_id", "=", query.eventId);
    }

    if (query.suppressionId) {
      builder = builder.where("deliveries.suppression_id", "=", query.suppressionId);
    }

    if (query.receipt) {
      builder = builder.where(deliveryReceiptPredicate(query.receipt));
    }

    if (query.state) {
      builder = builder.where("deliveries.state", "=", query.state);
    }

    if (query.minAttempts) {
      builder = builder.where("deliveries.attempt_count", ">=", query.minAttempts);
    }

    if (query.since) {
      builder = builder.where(timeColumn, ">=", query.since);
    }

    if (query.until) {
      builder = builder.where(timeColumn, "<", query.until);
    }

    if (query.q) {
      builder = builder.where(deliverySearchPredicate(query.q));
    }

    const row = await builder.executeTakeFirst();

    return row?.total ?? 0;
  }

  /**
   * Maps each delivery to its latest completed attempt.
   *
   * One `IN (...)` read for the whole event instead of one read per delivery:
   * an event fans out to a small number of deliveries, but the detail page is
   * the page operators open during an incident and the query count should not
   * grow with the fan-out. Completed only, because a `running` attempt has no
   * response to show yet.
   */
  private async latestAttemptsByDelivery(
    deliveryIds: string[],
  ): Promise<Map<string, EventDetailLatestAttempt>> {
    if (deliveryIds.length === 0) {
      return new Map();
    }

    const rows = await this.context.db
      .selectFrom("delivery_attempts")
      .select(["delivery_id", "response_status", "finished_at"])
      .where("delivery_id", "in", deliveryIds)
      .where("state", "!=", "running")
      .orderBy("delivery_id")
      .orderBy("attempt_number", "desc")
      .execute();

    const latest = new Map<string, EventDetailLatestAttempt>();

    for (const row of rows) {
      if (!latest.has(row.delivery_id)) {
        latest.set(row.delivery_id, {
          response_status: row.response_status,
          finished_at: row.finished_at,
        });
      }
    }

    return latest;
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
 * Event search covers title, message, fingerprint, idempotency key, labels,
 * upstream provider metadata, and identifiers
 * (`operations.filters.searchPlaceholder`). A pasted delivery id also finds the
 * event that produced it, so on-call can jump from an alert notification back
 * to the event. Every event list and count query shares this predicate so a
 * page and its `total` cannot disagree.
 *
 * Labels and provider metadata are matched against their stored JSON text, the
 * same way title and message are matched: matching uses the raw value, while
 * the DTO projection still redacts credential-shaped content, and a hit only
 * reveals that a row exists. Raw payloads and headers stay out of scope: they
 * are uncurated upstream documents that are only ever displayed as redacted
 * projections, so matching them would widen that existence check without
 * helping on-call find an alert by its identity fields.
 *
 * Whitespace separates terms. Every term must match somewhere inside the
 * event's searchable fields, so `disk prod` finds the critical disk alert
 * without the operator knowing which field holds which word. Terms are ANDed;
 * a single term keeps the historical substring behavior.
 */
function eventSearchPredicate(query: string) {
  const terms = splitOperationSearchTerms(query).terms;

  if (terms.length === 0) {
    return sql<boolean>`1 = 1`;
  }

  return sql<boolean>`${sql.join(terms.map(eventTermPredicate), sql` AND `)}`;
}

function eventTermPredicate(term: string) {
  const pattern = escapeLikeTerm(term);

  return sql<boolean>`(
    events.id LIKE ${pattern} ESCAPE '\\'
    OR events.title LIKE ${pattern} ESCAPE '\\'
    OR events.message LIKE ${pattern} ESCAPE '\\'
    OR events.fingerprint LIKE ${pattern} ESCAPE '\\'
    OR events.idempotency_key LIKE ${pattern} ESCAPE '\\'
    OR events.labels_json LIKE ${pattern} ESCAPE '\\'
    OR events.provider_metadata_json LIKE ${pattern} ESCAPE '\\'
    OR EXISTS (
      SELECT 1 FROM deliveries AS searched_deliveries
      WHERE searched_deliveries.event_id = events.id
        AND searched_deliveries.id LIKE ${pattern} ESCAPE '\\'
    )
  )`;
}

/**
 * Delivery search covers the event fields above (including the idempotency key,
 * labels, and upstream provider metadata), both identifiers (the delivery id
 * itself and the id of the event it belongs to), and the facts the deliveries
 * table and detail page display: the latest error, the error of any earlier
 * attempt, the destination name, the route name, and the external message
 * reference returned by the destination provider. `deliveries.last_error` is
 * cleared once an attempt succeeds, so the attempt errors keep the transient
 * failure on-call saw in the retry history searchable; attempts are matched
 * through a correlated `EXISTS` exactly like destination and route, so the
 * count query keeps its existing joins and cannot count duplicated rows. Like
 * the event predicate, list and count queries share it, and
 * whitespace-separated terms are ANDed across the same field groups.
 */
function deliverySearchPredicate(query: string) {
  const terms = splitOperationSearchTerms(query).terms;

  if (terms.length === 0) {
    return sql<boolean>`1 = 1`;
  }

  return sql<boolean>`${sql.join(terms.map(deliveryTermPredicate), sql` AND `)}`;
}

function deliveryTermPredicate(term: string) {
  const pattern = escapeLikeTerm(term);

  return sql<boolean>`(
    deliveries.id LIKE ${pattern} ESCAPE '\\'
    OR events.id LIKE ${pattern} ESCAPE '\\'
    OR events.title LIKE ${pattern} ESCAPE '\\'
    OR events.message LIKE ${pattern} ESCAPE '\\'
    OR events.fingerprint LIKE ${pattern} ESCAPE '\\'
    OR events.idempotency_key LIKE ${pattern} ESCAPE '\\'
    OR events.labels_json LIKE ${pattern} ESCAPE '\\'
    OR events.provider_metadata_json LIKE ${pattern} ESCAPE '\\'
    OR deliveries.last_error LIKE ${pattern} ESCAPE '\\'
    OR deliveries.provider_ref_value LIKE ${pattern} ESCAPE '\\'
    OR EXISTS (
      SELECT 1 FROM delivery_attempts AS searched_attempts
      WHERE searched_attempts.delivery_id = deliveries.id
        AND searched_attempts.error LIKE ${pattern} ESCAPE '\\'
    )
    OR EXISTS (
      SELECT 1 FROM destinations AS searched_destinations
      WHERE searched_destinations.id = deliveries.destination_id
        AND searched_destinations.name LIKE ${pattern} ESCAPE '\\'
    )
    OR EXISTS (
      SELECT 1 FROM routes AS searched_routes
      WHERE searched_routes.id = deliveries.route_id
        AND searched_routes.name LIKE ${pattern} ESCAPE '\\'
    )
  )`;
}

/**
 * Restricts events to those whose fan-out produced a matching delivery.
 *
 * `none` is `NOT EXISTS`, so it covers both halves of a silently dropped alert:
 * no route matched, and a matched route that carried no destination. The other
 * values are "at least one delivery in this state". A correlated `EXISTS`
 * keyed on `idx_deliveries_event_id` keeps the count query's shape unchanged and
 * cannot duplicate an event row the way a second join would.
 */
function eventDeliveryOutcomePredicate(outcome: EventDeliveryOutcome) {
  if (outcome === "none") {
    return sql<boolean>`NOT EXISTS (
      SELECT 1 FROM deliveries AS outcome_deliveries
      WHERE outcome_deliveries.event_id = events.id
    )`;
  }

  return sql<boolean>`EXISTS (
    SELECT 1 FROM deliveries AS outcome_deliveries
    WHERE outcome_deliveries.event_id = events.id
      AND outcome_deliveries.state = ${outcome}
  )`;
}

/**
 * Restricts events by whether they reached one destination.
 *
 * `delivered` is `EXISTS` over the event's deliveries to that destination, so
 * any state — failed, silenced, still queued — counts: the filter answers "was
 * this target covered", and the state dimension belongs to `deliveryOutcome`
 * and the delivery list. `missing` is the negation, including events that
 * produced no delivery at all; that is the half a delivery-level filter can
 * never show. A correlated `EXISTS` keyed on `idx_deliveries_event_id` keeps
 * the count query's shape unchanged and cannot duplicate an event row the way a
 * second join would.
 */
function eventDestinationPredicate(destinationId: string, match: EventDestinationMatch) {
  const reached = sql<boolean>`EXISTS (
    SELECT 1 FROM deliveries AS destination_deliveries
    WHERE destination_deliveries.event_id = events.id
      AND destination_deliveries.destination_id = ${destinationId}
  )`;

  return match === "missing" ? sql<boolean>`NOT ${reached}` : reached;
}

/**
 * The delivery column the list window and order are measured against.
 *
 * `updated_at` is the visible 更新时间 and moves on every retry or state
 * change, so the window and the ordered column must agree with what the table
 * shows. `created` keeps the historical behavior for callers that do not ask.
 */
function deliveryTimeColumn(
  timeField: DeliveryTimeField | undefined,
): "deliveries.created_at" | "deliveries.updated_at" {
  return timeField === "updated" ? "deliveries.updated_at" : "deliveries.created_at";
}

/**
 * Restricts deliveries to destinations of one adapter kind.
 *
 * The predicate is an `EXISTS` subquery rather than a join so the list and
 * count queries apply exactly the same filter; the count query does not need
 * the destinations join, and the shared predicate keeps the page and its
 * `total` from drifting apart.
 */
function deliveryDestinationKindPredicate(kind: DestinationKind) {
  return sql<boolean>`EXISTS (
    SELECT 1 FROM destinations AS filtered_destinations
    WHERE filtered_destinations.id = deliveries.destination_id
      AND filtered_destinations.kind = ${kind}
  )`;
}

/**
 * Restricts deliveries by whether the target returned a message reference.
 *
 * A reference needs both halves, so a half-written legacy row counts as
 * missing. The page and its `total` share this predicate, which is what keeps
 * the count from claiming rows the list does not show.
 */
function deliveryReceiptPredicate(receipt: DeliveryReceiptFilter) {
  const present = sql<boolean>`(
    deliveries.provider_ref_type IS NOT NULL
    AND deliveries.provider_ref_value IS NOT NULL
  )`;

  return receipt === "present" ? present : sql<boolean>`NOT ${present}`;
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

/** SQLite count queries always return one row; treat a missing row as zero. */
async function countAll(run: () => Promise<{ count: number } | undefined>): Promise<number> {
  return (await run())?.count ?? 0;
}
