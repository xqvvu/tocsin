import "@tanstack/react-start/server-only";
import { createHash, timingSafeEqual } from "node:crypto";

import { getLogger } from "@logtape/logtape";

import {
  createStableHash,
  evaluateRouteMatch,
  findMatchingRoutes,
  redactHeaders,
  redactJsonValue,
  redactText,
  toJsonValue,
} from "@tocsin/core";
import type { JsonValue } from "@tocsin/core";
import type { ProviderParseFailure, ProviderParseSuccess } from "@tocsin/providers";

import type { SourceRuntimeConfig } from "#/infra/sqlite/repositories/source/source.interface";
import type {
  AcceptedWebhook,
  AcceptWebhookInput,
  ParserFailureRecordInput,
  RawPayloadSweepGate,
  WebhookIntakeErrorOptions,
  WebhookIntakeFailureReason,
  WebhookIntakeServiceOptions,
} from "#/server/intake/intake.service.types";

const intakeLogger = getLogger(["tocsin", "intake"]);

export class WebhookIntakeError extends Error {
  readonly eventId: string | null;

  constructor(
    readonly reason: WebhookIntakeFailureReason,
    message: string,
    options?: WebhookIntakeErrorOptions,
  ) {
    super(message, options);
    this.name = "WebhookIntakeError";
    this.eventId = options?.eventId ?? null;
  }
}

export class WebhookIntakeService {
  private readonly store: WebhookIntakeServiceOptions["store"];
  private readonly providers: WebhookIntakeServiceOptions["providers"];
  private readonly now: () => string;
  private readonly dedupeWindowMs: number;
  private readonly sweepGate: RawPayloadSweepGate;

  constructor(options: WebhookIntakeServiceOptions) {
    this.store = options.store;
    this.providers = options.providers;
    this.now = options.now ?? (() => new Date().toISOString());
    this.dedupeWindowMs = options.dedupeWindowMs ?? 5 * 60 * 1000;
    this.sweepGate = options.sweepGate ?? createRawPayloadSweepGate();
  }

  async acceptWebhook(input: AcceptWebhookInput): Promise<AcceptedWebhook> {
    const receivedAt = input.receivedAt ?? this.now();
    const source = await this.store.sources.get(input.sourceId);

    if (!source) {
      logIntakeRejected(input.sourceId, "source_not_found");
      throw new WebhookIntakeError("source_not_found", `Source not found: ${input.sourceId}`);
    }

    if (!source.enabled) {
      logIntakeRejected(input.sourceId, "source_disabled", source.provider);
      throw new WebhookIntakeError("source_disabled", `Source is disabled: ${input.sourceId}`);
    }

    if (!verifyWebhookAuthentication({ token: input.token, headers: input.headers, source })) {
      logIntakeRejected(input.sourceId, "invalid_token", source.provider);
      throw new WebhookIntakeError("invalid_token", "Invalid source token");
    }

    const payload = toJsonValue(input.payload);
    const rawHeaders = redactHeaders(input.headers);
    const rawPayload = redactJsonValue(payload) as JsonValue;

    const parsed = await this.parseProviderPayload({
      source,
      payload,
      rawPayload,
      rawHeaders,
      receivedAt,
    });

    const routes = await this.store.routes.list();
    const routeMatches = routes.map((route) =>
      evaluateRouteMatch(route, {
        sourceId: source.id,
        event: parsed.normalized,
      }),
    );
    const matchedRoutes = findMatchingRoutes(
      routes.filter((route) => route.enabled),
      {
        sourceId: source.id,
        event: parsed.normalized,
      },
    );

    let pruneCutoff: string | null = null;

    const accepted: AcceptedWebhook = await this.store.transaction(async (tx) => {
      const settings = await tx.settings.get();
      const event = await tx.intake.recordEvent({
        sourceId: source.id,
        idempotencyKey: parsed.idempotencyKey,
        normalized: parsed.normalized,
        providerMetadata: parsed.providerMetadata,
        rawPayload,
        rawHeaders,
        routeMatches,
        receivedAt,
      });
      const enqueue = await tx.deliveries.enqueueForEvent({
        event,
        matches: matchedRoutes.map((match) => ({
          routeId: match.routeId,
          destinationIds: match.destinationIds,
        })),
        dedupeWindowStartsAt: new Date(
          new Date(receivedAt).valueOf() - this.dedupeWindowMs,
        ).toISOString(),
        now: receivedAt,
      });
      // Bounded: this is the ingest request path, so the batch keeps the
      // per-webhook cost constant no matter how large the backlog is.
      pruneCutoff = retentionCutoff(receivedAt, settings.rawPayloadRetentionDays);
      await tx.intake.pruneRawPayloads({ before: pruneCutoff });

      return {
        accepted: true,
        eventId: event.id,
        createdDeliveryIds: enqueue.created.map((delivery) => delivery.id),
        dedupedDeliveryCount: enqueue.deduped.length,
        matchedRoutes,
      };
    });

    intakeLogger.info(
      "Webhook accepted as event {eventId} with {createdDeliveryCount} deliveries",
      {
        sourceId: source.id,
        provider: source.provider,
        eventId: accepted.eventId,
        matchedRouteCount: accepted.matchedRoutes.length,
        createdDeliveryCount: accepted.createdDeliveryIds.length,
        dedupedDeliveryCount: accepted.dedupedDeliveryCount,
      },
    );

    // Finish the backlog off the response path. The bounded prune above already
    // did its share; this drains the rest so retention converges even during a
    // quiet period. Not awaited on purpose — the webhook must not wait on it.
    this.sweepRawPayloadsKicked(pruneCutoff);

    return accepted;
  }

  /**
   * Drain remaining stale raw payloads in the background.
   *
   * Single-flight: if a sweep is already running, this webhook's batch was
   * already pruned and the running sweep will reach the rest, so there is
   * nothing to add. Without this guard a burst of concurrent webhooks would
   * each start a full-table drain and multiply the very cost we bounded. The
   * gate is shared across service instances by the container, because one
   * instance per request would otherwise never see its neighbours.
   *
   * Failures are swallowed deliberately: this is housekeeping off the request
   * path, and the next webhook retries it. Surfacing an error here would report a
   * failure for a webhook that in fact succeeded.
   */
  private sweepRawPayloadsKicked(cutoff: string | null): void {
    if (cutoff === null || !this.sweepGate.tryAcquire()) {
      return;
    }

    void this.store.intake
      .pruneAllRawPayloads({ before: cutoff })
      .catch(() => undefined)
      .finally(() => {
        this.sweepGate.release();
      });
  }

  private recordParserFailureEvent(input: ParserFailureRecordInput): Promise<string> {
    const payloadHash = createStableHash(input.payload);
    const parseFailure = isProviderParseFailure(input.error) ? input.error : null;
    const errorMessage = redactText(
      parseFailure?.message ??
        (input.error instanceof Error ? input.error.message : String(input.error)),
    );

    return this.store.transaction(async (tx) => {
      const settings = await tx.settings.get();
      const event = await tx.intake.recordEvent({
        sourceId: input.sourceId,
        idempotencyKey: null,
        normalized: {
          title: "Provider parser rejected webhook payload",
          message: "Webhook payload was stored for inspection but could not be normalized.",
          severity: "unknown",
          status: "unknown",
          fingerprint: `parse_failed:${input.sourceId}:${payloadHash}`,
          labels: {
            provider: input.sourceProvider,
            parse_failed: "true",
          },
          occurredAt: input.receivedAt,
        },
        providerMetadata: {
          provider: input.sourceProvider,
          parserVersion: 1,
          parseFailed: true,
          payloadHash,
          errorName: parseFailure
            ? "ProviderParseFailure"
            : input.error instanceof Error
              ? input.error.name
              : "Error",
          ...(parseFailure ? { reason: parseFailure.reason } : {}),
          errorMessage,
        },
        rawPayload: input.rawPayload,
        rawHeaders: input.rawHeaders,
        routeMatches: [],
        receivedAt: input.receivedAt,
      });
      await tx.intake.pruneRawPayloads({
        before: retentionCutoff(input.receivedAt, settings.rawPayloadRetentionDays),
      });

      return event.id;
    });
  }

  private async parseProviderPayload(input: {
    source: SourceRuntimeConfig;
    payload: JsonValue;
    rawPayload: JsonValue;
    rawHeaders: Record<string, string>;
    receivedAt: string;
  }): Promise<ProviderParseSuccess> {
    const { source, payload, rawPayload, rawHeaders, receivedAt } = input;
    const result = await (async (): Promise<ProviderParseSuccess | ProviderParseFailure> => {
      try {
        return this.providers.parse(source.provider, {
          source: {
            id: source.id,
            name: source.name,
            provider: source.provider,
            enabled: source.enabled,
          },
          sourceId: source.id,
          sourceName: source.name,
          receivedAt,
          headers: rawHeaders,
          payload,
          config: source.config,
        });
      } catch (error) {
        return this.raiseProviderParseFailure({
          sourceId: source.id,
          sourceProvider: source.provider,
          payload,
          rawPayload,
          rawHeaders,
          receivedAt,
          error,
        });
      }
    })();

    if (result.ok) {
      return result;
    }

    return this.raiseProviderParseFailure({
      sourceId: source.id,
      sourceProvider: source.provider,
      payload,
      rawPayload,
      rawHeaders,
      receivedAt,
      error: result,
    });
  }

  private async raiseProviderParseFailure(input: ParserFailureRecordInput): Promise<never> {
    const eventId = await this.recordParserFailureEvent(input);
    const parseFailure = isProviderParseFailure(input.error) ? input.error : null;

    intakeLogger.warn("Webhook payload rejected by {provider} parser", {
      sourceId: input.sourceId,
      provider: input.sourceProvider,
      eventId,
      failureReason: parseFailure?.reason ?? "unexpected_parser_error",
      errorName: input.error instanceof Error ? input.error.name : "ProviderParseFailure",
    });

    throw new WebhookIntakeError(
      "provider_parse_failed",
      "Provider parser rejected webhook payload",
      {
        cause: input.error,
        eventId,
      },
    );
  }
}

/**
 * Builds the process-wide latch the container shares between intake service
 * instances. Exported for wiring and for tests that need two instances to
 * coordinate exactly as they do in production.
 */
export function createRawPayloadSweepGate(): RawPayloadSweepGate {
  let running = false;

  return {
    tryAcquire() {
      if (running) {
        return false;
      }

      running = true;

      return true;
    },
    release() {
      running = false;
    },
  };
}

function logIntakeRejected(
  sourceId: string,
  reason: Exclude<WebhookIntakeFailureReason, "provider_parse_failed">,
  provider?: string,
): void {
  intakeLogger.warn("Webhook intake rejected for source {sourceId}: {reason}", {
    sourceId,
    reason,
    ...(provider ? { provider } : {}),
  });
}

export function hashSourceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifySourceToken(token: string, expectedHash: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) {
    return false;
  }

  const actual = Buffer.from(hashSourceToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function verifyWebhookAuthentication(input: {
  token?: string | null;
  headers: Record<string, string>;
  source: { tokenHash: string; config: Record<string, unknown> };
}): boolean {
  if (input.token && verifySourceToken(input.token, input.source.tokenHash)) {
    return true;
  }

  return verifyProviderSecret(input.headers, input.source.config);
}

function isProviderParseFailure(error: unknown): error is ProviderParseFailure {
  return (
    typeof error === "object" &&
    error !== null &&
    "ok" in error &&
    (error as { ok?: unknown }).ok === false &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

function verifyProviderSecret(
  headers: Record<string, string>,
  sourceConfig: Record<string, unknown>,
): boolean {
  const expected = sourceConfig.signingSecret;

  return (
    typeof expected === "string" &&
    expected.length > 0 &&
    timingSafeStringEqual(headerValue(headers, "x-tocsin-provider-secret"), expected)
  );
}

function headerValue(headers: Record<string, string>, name: string): string | null {
  const target = name.toLocaleLowerCase();

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLocaleLowerCase() === target) {
      return value;
    }
  }

  return null;
}

function timingSafeStringEqual(actual: string | null, expected: string): boolean {
  if (actual === null) {
    return false;
  }

  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);

  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function retentionCutoff(referenceTime: string, days: number): string {
  return new Date(new Date(referenceTime).valueOf() - days * 24 * 60 * 60 * 1000).toISOString();
}
