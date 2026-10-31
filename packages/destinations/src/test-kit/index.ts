import type { DestinationSummary, JsonValue, NormalizedEvent, SourceSummary } from "@tocsin/core";

import type {
  DestinationPresentation,
  DestinationSendInput,
  FetchLike,
  FetchLikeResponse,
} from "#destinations/types";

/**
 * Fixture helpers for destination adapter tests.
 *
 * Adapter self-tests should build their input with `destinationSendInput` and
 * their transport with `fakeFetch` instead of copying a `DestinationSendInput`
 * literal and a recorder per adapter. Import this module through its subpath so
 * test-only code stays out of the runtime entrypoints:
 *
 * ```ts
 * import { destinationSendInput, fakeFetch } from "@tocsin/destinations/test-kit";
 *
 * const input = destinationSendInput({
 *   destination: { kind: "discord", name: "Discord SRE" },
 *   config: { webhookUrl: "https://discord.example.test/webhook" },
 * });
 * const fetch = fakeFetch(() => ({ status: 204, body: "no content" }));
 *
 * const result = await discordSender.send(input, { fetch });
 *
 * expect(fetch.calls[0]?.url).toBe(input.config.webhookUrl);
 * ```
 */

const SampleSource: SourceSummary = {
  id: "source-1",
  name: "Grafana prod",
  provider: "grafana",
  enabled: true,
};

const SampleDestination: Omit<DestinationSummary, "kind"> = {
  id: "dest-1",
  name: "Tocsin SRE",
  enabled: true,
};

const SampleEvent: NormalizedEvent = {
  title: "Checkout API latency high",
  message: "p95 latency exceeded",
  severity: "critical",
  status: "firing",
  fingerprint: "checkout-latency",
  labels: {
    service: "checkout",
  },
  occurredAt: "2026-06-07T08:00:00.000Z",
};

export interface DestinationSendInputOverrides<Config> {
  /** Adapter config under test. Every other field falls back to the sample fixture. */
  config: Config;
  /**
   * The adapter kind under test. Required, so an adapter test always states the
   * kind it is exercising instead of inheriting a misleading sample.
   */
  destination: Partial<Omit<DestinationSummary, "kind">> & Pick<DestinationSummary, "kind">;
  eventId?: string;
  /** Persisted delivery id; omitted stands for a preview or test send. */
  deliveryId?: string;
  source?: Partial<SourceSummary>;
  normalizedEvent?: Partial<NormalizedEvent>;
  /** Upstream group size; omitted keeps `tocsin.alertCount` empty. */
  alertCount?: number;
  payload?: JsonValue;
  presentation?: DestinationPresentation;
}

/**
 * Builds a complete `DestinationSendInput` from a sample alert, overriding only
 * the parts one adapter test cares about. Nested `source`, `destination` and
 * `normalizedEvent` fields merge one level deep; pass `labels` wholesale to
 * replace the sample labels.
 */
export function destinationSendInput<Config>(
  overrides: DestinationSendInputOverrides<Config>,
): DestinationSendInput<Config> {
  const input: DestinationSendInput<Config> = {
    eventId: overrides.eventId ?? "event-1",
    ...(overrides.deliveryId === undefined ? {} : { deliveryId: overrides.deliveryId }),
    source: { ...SampleSource, ...overrides.source },
    destination: { ...SampleDestination, ...overrides.destination },
    normalizedEvent: { ...SampleEvent, ...overrides.normalizedEvent },
    config: overrides.config,
  };

  if (overrides.alertCount !== undefined) {
    input.alertCount = overrides.alertCount;
  }

  if (overrides.payload !== undefined) {
    input.payload = overrides.payload;
  }

  if (overrides.presentation !== undefined) {
    input.presentation = overrides.presentation;
  }

  return input;
}

export interface FakeFetchCall {
  url: string;
  init: RequestInit;
}

export interface FakeFetchResponse {
  /** Defaults to `true`. */
  ok?: boolean;
  /** Defaults to `200`. */
  status?: number;
  /** Defaults to `"ok"`. */
  body?: string;
}

/** Answer one recorded request. Throwing here behaves like a transport failure. */
export type FakeFetchHandler = (call: FakeFetchCall) => FakeFetchResponse | undefined | void;

/** `FetchLike` that records every request so a test can assert on the call it caused. */
export interface FakeFetch extends FetchLike {
  readonly calls: FakeFetchCall[];
}

/**
 * Records requests and answers each one from `handler`, defaulting to
 * `{ ok: true, status: 200, body: "ok" }`.
 */
export function fakeFetch(handler?: FakeFetchHandler): FakeFetch {
  const calls: FakeFetchCall[] = [];

  return Object.assign(
    async (url: string, init: RequestInit): Promise<FetchLikeResponse> => {
      const call: FakeFetchCall = { url, init };

      calls.push(call);

      const response = handler?.(call) ?? {};

      return {
        ok: response.ok ?? true,
        status: response.status ?? 200,
        text: async () => response.body ?? "ok",
      };
    },
    { calls },
  );
}
