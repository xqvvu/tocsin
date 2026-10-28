import {
  RehearseSourceCommandSchema,
  evaluateRouteMatch,
  redactJsonText,
  redactJsonValue,
  redactText,
  type NormalizedEvent,
  type RehearseSourceCommand,
  type RouteMatchResult,
  type SourceRehearsalRender,
  type SourceRehearsalResult,
  type SourceSummary,
} from "@tocsin/core";
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
        renders: [],
      };
    }

    const routes = await this.store.routes.list();
    const matches = routes.map((route) =>
      evaluateRouteMatch(route, { sourceId: source.id, event: parsed.normalized }),
    );
    const renders = await this.renderMatchedDestinations({
      matches,
      source: summary,
      normalizedEvent: parsed.normalized,
      payload: input.payload,
    });

    return {
      source: summary,
      receivedAt,
      parse: {
        ok: true,
        normalizedEvent: parsed.normalized,
        providerMetadata: parsed.providerMetadata,
      },
      routes: matches,
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
    payload: RehearseSourceCommand["payload"];
  }): Promise<SourceRehearsalRender[]> {
    const destinationIds = [
      ...new Set(
        input.matches.filter((match) => match.matched).flatMap((match) => match.destinationIds),
      ),
    ];

    if (destinationIds.length === 0) {
      return [];
    }

    const settings = await this.store.settings.get();
    const presentation = { locale: settings.locale, timeZone: settings.timeZone };
    const payload = redactJsonValue(input.payload);
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
        });
        continue;
      }

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
        });
      } catch (error) {
        renders.push({
          destinationId: destination.id,
          destinationName: destination.name,
          enabled: destination.enabled,
          ok: false,
          renderedPayload: "",
          errorMessage: redactText(error instanceof Error ? error.message : String(error)),
        });
      }
    }

    return renders;
  }
}
