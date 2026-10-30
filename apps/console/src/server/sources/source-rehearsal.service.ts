import {
  RehearseSourceCommandSchema,
  evaluateRouteMatch,
  formatSuppressionReason,
  readProviderAlertCount,
  redactJsonText,
  redactNormalizedEvent,
  redactRouteMatchChecks,
  redactRouteMatchResults,
  redactText,
  selectSuppressionForDelivery,
  type JsonObject,
  type NormalizedEvent,
  type RehearseSourceCommand,
  type RouteMatchResult,
  type SourceRehearsalDedupe,
  type SourceRehearsalDelivery,
  type SourceRehearsalRender,
  type SourceRehearsalResult,
  type SourceRehearsalSuppression,
  type SourceRehearsalVerdict,
  type SourceSummary,
  type Suppression,
} from "@tocsin/core";
import type { DestinationPresentation } from "@tocsin/destinations";
import type { ProviderParseResult } from "@tocsin/providers";

import { RecordNotFoundError } from "#/infra/sqlite/errors";
import type { DedupeKeyHit } from "#/infra/sqlite/repositories/delivery/delivery.interface";
import type { SourceRuntimeConfig } from "#/infra/sqlite/repositories/source/source.interface";
import type { SqliteStore } from "#/infra/sqlite/store";
import { parseDestinationConfig } from "#/server/configuration/configuration-support";
import type { SourceRehearsalServiceOptions } from "#/server/sources/source-rehearsal.service.types";

/**
 * Replays a pasted upstream payload through a Source's provider parser and the
 * current route rules.
 *
 * Read-only by construction: it never touches the event, delivery, or job
 * tables and never calls an adapter's transport. The rendered destination
 * previews are the same pure rendering the destination preview uses, so an
 * operator can validate the whole intake chain before pointing the upstream
 * sender at Tocsin.
 */
export class SourceRehearsalService {
  private readonly store: SqliteStore;
  private readonly providers: SourceRehearsalServiceOptions["providers"];
  private readonly destinations: SourceRehearsalServiceOptions["destinations"];
  private readonly now: () => string;
  private readonly dedupeWindowMs: number;

  constructor(options: SourceRehearsalServiceOptions) {
    this.store = options.store;
    this.providers = options.providers;
    this.destinations = options.destinations;
    this.now = options.now ?? (() => new Date().toISOString());
    this.dedupeWindowMs = options.dedupeWindowMs ?? 5 * 60 * 1000;
  }

  async rehearseSource(command: RehearseSourceCommand): Promise<SourceRehearsalResult> {
    const input = RehearseSourceCommandSchema.parse(command);
    const source = await this.store.sources.get(input.sourceId);

    if (!source) {
      throw new RecordNotFoundError("Source", input.sourceId);
    }

    const summary: SourceSummary = {
      id: source.id,
      name: source.name,
      provider: source.provider,
      enabled: source.enabled,
    };
    const receivedAt = this.now();
    // Read before parsing so a parse failure still reports whether the real
    // chain would send the alert at all; the queue keeps running either way.
    const settings = await this.store.settings.get();
    const delivery: SourceRehearsalDelivery = {
      paused: settings.deliveryPaused,
      pausedAt: settings.deliveryPausedAt,
    };
    const parsed = this.parsePayload(source, summary, input.payload, receivedAt);

    if (!parsed.ok) {
      return {
        source: summary,
        receivedAt,
        parse: {
          ok: false,
          reason: parsed.reason,
          message: redactText(parsed.message),
        },
        routes: [],
        delivery,
        renders: [],
      };
    }

    // Matching keeps the raw event: the route engine compares real values, and
    // redacting first would change which rules match. Everything that leaves
    // this method is projected the same way a stored event is at its read
    // boundary, and the destination preview renders from the projection so the
    // rehearsal shows exactly what the alert would carry in production
    // (`delivery-execution.ts` redacts before rendering too).
    const displayEvent = redactNormalizedEvent(parsed.normalized);
    const routes = await this.store.routes.list();
    const matches = routes.map((route) =>
      evaluateRouteMatch(route, { sourceId: source.id, event: parsed.normalized }),
    );
    // A provider that produced no idempotency key is never deduped by the real
    // intake either, so the lookup only runs when one exists.
    const dedupeWindowStartsAt = new Date(
      new Date(receivedAt).valueOf() - this.dedupeWindowMs,
    ).toISOString();
    const dedupeKeyHits = parsed.idempotencyKey
      ? await this.store.deliveries.findDedupeKeys({
          sourceId: source.id,
          idempotencyKey: parsed.idempotencyKey,
          windowStartsAt: dedupeWindowStartsAt,
        })
      : [];
    const renders = await this.renderMatchedDestinations({
      matches,
      source: summary,
      normalizedEvent: displayEvent,
      // Suppression matching keeps the raw event for the same reason route
      // matching does: redacting first could change which rule matches.
      rawEvent: parsed.normalized,
      // The rehearsal renders what a real delivery would carry, so it reads the
      // group size from the same parser metadata the intake records.
      alertCount: readProviderAlertCount(parsed.providerMetadata),
      payload: input.payload,
      receivedAt,
      presentation: { locale: settings.locale, timeZone: settings.timeZone },
      delivery,
      dedupe: {
        applicable: Boolean(parsed.idempotencyKey),
        windowMs: this.dedupeWindowMs,
        windowStartsAt: dedupeWindowStartsAt,
        hits: dedupeKeyHits,
      },
    });

    return {
      source: summary,
      receivedAt,
      parse: {
        ok: true,
        normalizedEvent: displayEvent,
        providerMetadata: redactJsonText(parsed.providerMetadata) as JsonObject,
      },
      routes: redactRouteMatchResults(matches),
      delivery,
      renders,
    };
  }

  /**
   * The registry validates the Source's stored config before the adapter parses,
   * so a config rejected here is a configuration failure rather than a payload
   * failure. The intake path records that as a parser-failure Event; a
   * rehearsal just reports it.
   */
  private parsePayload(
    source: SourceRuntimeConfig,
    summary: SourceSummary,
    payload: RehearseSourceCommand["payload"],
    receivedAt: string,
  ): ProviderParseResult {
    try {
      return this.providers.parse(source.provider, {
        source: summary,
        sourceId: source.id,
        sourceName: source.name,
        receivedAt,
        headers: {},
        payload,
        config: source.config,
      });
    } catch (error) {
      return {
        ok: false,
        reason: "configuration_error",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async renderMatchedDestinations(input: {
    matches: RouteMatchResult[];
    source: SourceSummary;
    normalizedEvent: NormalizedEvent;
    rawEvent: NormalizedEvent;
    /** Upstream group size, when the parser reported one. */
    alertCount?: number;
    payload: RehearseSourceCommand["payload"];
    receivedAt: string;
    presentation: DestinationPresentation;
    delivery: SourceRehearsalDelivery;
    dedupe: {
      applicable: boolean;
      windowMs: number;
      windowStartsAt: string;
      hits: DedupeKeyHit[];
    };
  }): Promise<SourceRehearsalRender[]> {
    const destinationIds = [
      ...new Set(
        input.matches.filter((match) => match.matched).flatMap((match) => match.destinationIds),
      ),
    ];

    if (destinationIds.length === 0) {
      return [];
    }

    // The same rule set the enqueue path reads inside its transaction, so the
    // verdict is the enqueue-time decision rather than a second interpretation
    // of the matcher.
    const suppressions = await this.store.suppressions.list();
    const presentation = input.presentation;
    // Same projection the outbound path applies to the raw payload before it
    // reaches a template: value-shape-only redaction misses `{"text":"token=…"}`
    // under a neutral key, and the rehearsal must not diverge from production.
    const payload = redactJsonText(input.payload);
    const renders: SourceRehearsalRender[] = [];

    for (const destinationId of destinationIds) {
      const destination = await this.store.destinations.get(destinationId);
      const dedupe = rehearsalDedupe({
        applicable: input.dedupe.applicable,
        windowMs: input.dedupe.windowMs,
        windowStartsAt: input.dedupe.windowStartsAt,
        matchedRoutes: input.matches.filter(
          (match) => match.matched && match.destinationIds.includes(destinationId),
        ),
        hits: input.dedupe.hits.filter((hit) => hit.destinationId === destinationId),
      });

      if (!destination) {
        renders.push({
          destinationId,
          destinationName: destinationId,
          enabled: false,
          ok: false,
          renderedPayload: "",
          errorMessage: `Destination not found: ${destinationId}`,
          verdict: "destination_disabled",
          suppression: null,
          dedupe,
        });
        continue;
      }

      const suppression = this.suppressionForDelivery({
        suppressions,
        sourceId: input.source.id,
        destinationId,
        rawEvent: input.rawEvent,
        receivedAt: input.receivedAt,
      });
      const verdict = rehearsalVerdict({
        dedupe,
        suppression,
        destinationEnabled: destination.enabled,
        paused: input.delivery.paused,
      });

      try {
        const config = parseDestinationConfig(
          this.destinations,
          destination.kind,
          destination.config,
        );
        const rendered = await this.destinations.preview(destination.kind, {
          eventId: "rehearsal",
          source: input.source,
          destination: {
            id: destination.id,
            name: destination.name,
            kind: destination.kind,
            enabled: destination.enabled,
          },
          normalizedEvent: input.normalizedEvent,
          alertCount: input.alertCount,
          payload,
          config,
          presentation,
        });

        renders.push({
          destinationId: destination.id,
          destinationName: destination.name,
          enabled: destination.enabled,
          ok: true,
          renderedPayload: JSON.stringify(redactJsonText(rendered), null, 2),
          errorMessage: null,
          verdict,
          suppression,
          dedupe,
        });
      } catch (error) {
        renders.push({
          destinationId: destination.id,
          destinationName: destination.name,
          enabled: destination.enabled,
          ok: false,
          renderedPayload: "",
          errorMessage: redactText(error instanceof Error ? error.message : String(error)),
          verdict,
          suppression,
          dedupe,
        });
      }
    }

    return renders;
  }

  /**
   * The rule the enqueue path would pick for this `(event, target)` pair.
   *
   * `selectSuppressionForDelivery` only returns active, matched rules, so a
   * scheduled or expired window never becomes a verdict here.
   */
  private suppressionForDelivery(input: {
    suppressions: Suppression[];
    sourceId: string;
    destinationId: string;
    rawEvent: NormalizedEvent;
    receivedAt: string;
  }): SourceRehearsalSuppression | null {
    const match = selectSuppressionForDelivery(
      input.suppressions,
      {
        sourceId: input.sourceId,
        destinationId: input.destinationId,
        event: input.rawEvent,
      },
      input.receivedAt,
    );

    if (!match) {
      return null;
    }

    const rule = input.suppressions.find((candidate) => candidate.id === match.suppressionId);

    if (!rule) {
      return null;
    }

    return {
      id: rule.id,
      name: rule.name,
      kind: rule.kind,
      reason: formatSuppressionReason(rule),
      checks: redactRouteMatchChecks(match.checks),
    };
  }
}

/**
 * Which dedupe state the enqueue path would reach for one target.
 *
 * A pair counts as deduped only when its exact `(route, destination)` key sits
 * inside the window: the key includes the route, so a route that never saw the
 * earlier event starts its own window and still gets a delivery.
 */
function rehearsalDedupe(input: {
  applicable: boolean;
  windowMs: number;
  windowStartsAt: string;
  /** Matched routes that target this destination; one pair per route. */
  matchedRoutes: RouteMatchResult[];
  /** In-window hits for this destination, oldest first. */
  hits: DedupeKeyHit[];
}): SourceRehearsalDedupe {
  const matchedRouteIds = new Set(input.matchedRoutes.map((route) => route.routeId));
  const matchedPairCount = matchedRouteIds.size;

  if (!input.applicable) {
    return {
      state: "not_applicable",
      windowMs: input.windowMs,
      windowStartsAt: input.windowStartsAt,
      matchedPairCount,
      dedupedPairCount: 0,
      routeId: null,
      routeName: null,
      firstEventId: null,
    };
  }

  const relevantHits = input.hits.filter((hit) => matchedRouteIds.has(hit.routeId));
  const earliestHit = relevantHits.at(0) ?? null;
  const dedupedPairCount = new Set(relevantHits.map((hit) => hit.routeId)).size;

  return {
    state:
      dedupedPairCount === 0
        ? "would_deliver"
        : dedupedPairCount === matchedPairCount
          ? "would_dedupe"
          : "partially_deduped",
    windowMs: input.windowMs,
    windowStartsAt: input.windowStartsAt,
    matchedPairCount,
    dedupedPairCount,
    routeId: earliestHit ? earliestHit.routeId : null,
    routeName: earliestHit
      ? (input.matchedRoutes.find((route) => route.routeId === earliestHit.routeId)?.routeName ??
        null)
      : null,
    firstEventId: earliestHit ? earliestHit.firstEventId : null,
  };
}

/**
 * Which gate the real delivery chain would hit, in the order it applies them:
 * the dedupe window skips the row before anything else, suppression makes the
 * row terminal at enqueue, a disabled target is never claimed, and a global
 * pause leaves the row pending.
 *
 * A partially deduped target still creates a row for its remaining pairs, so
 * only a full hit skips the enqueue.
 */
function rehearsalVerdict(input: {
  dedupe: SourceRehearsalDedupe;
  suppression: SourceRehearsalSuppression | null;
  destinationEnabled: boolean;
  paused: boolean;
}): SourceRehearsalVerdict {
  if (input.dedupe.state === "would_dedupe") {
    return "deduped";
  }

  if (input.suppression) {
    return "suppressed";
  }

  if (!input.destinationEnabled) {
    return "destination_disabled";
  }

  return input.paused ? "queued_paused" : "deliver";
}
