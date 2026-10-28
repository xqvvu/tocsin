import {
  RehearseSourceCommandSchema,
  evaluateRouteMatch,
  formatSuppressionReason,
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

  constructor(options: SourceRehearsalServiceOptions) {
    this.store = options.store;
    this.providers = options.providers;
    this.destinations = options.destinations;
    this.now = options.now ?? (() => new Date().toISOString());
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
    const renders = await this.renderMatchedDestinations({
      matches,
      source: summary,
      normalizedEvent: displayEvent,
      // Suppression matching keeps the raw event for the same reason route
      // matching does: redacting first could change which rule matches.
      rawEvent: parsed.normalized,
      payload: input.payload,
      receivedAt,
      presentation: { locale: settings.locale, timeZone: settings.timeZone },
      delivery,
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
    payload: RehearseSourceCommand["payload"];
    receivedAt: string;
    presentation: DestinationPresentation;
    delivery: SourceRehearsalDelivery;
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
 * Which gate the real delivery chain would hit, in the order it applies them:
 * suppression makes the row terminal at enqueue, a disabled target is never
 * claimed, and a global pause leaves the row pending.
 */
function rehearsalVerdict(input: {
  suppression: SourceRehearsalSuppression | null;
  destinationEnabled: boolean;
  paused: boolean;
}): SourceRehearsalVerdict {
  if (input.suppression) {
    return "suppressed";
  }

  if (!input.destinationEnabled) {
    return "destination_disabled";
  }

  return input.paused ? "queued_paused" : "deliver";
}
