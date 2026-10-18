import type { DestinationKind, JsonValue } from "@tocsin/core";
import type { z } from "zod";

import {
  DEFAULT_DESTINATION_TIMEOUT_MS,
  createTimeoutFetch,
  isTimeoutError,
} from "#destinations/transport";
import type {
  DestinationAdapter,
  DestinationAdapterDefinition,
  DestinationRetryHint,
  DestinationSendResult,
  DestinationTransportContext,
  FetchLike,
  FetchLikeResponse,
} from "#destinations/types";

/** Fully resolved transport settings used by one adapter call. */
export interface DestinationTransport {
  fetch: FetchLike;
  now: () => Date;
  timeoutMs: number;
}

type Ok = Extract<DestinationSendResult, { ok: true }>;
type Fail = Extract<DestinationSendResult, { ok: false }>;

export class R {
  static ok(input: Omit<Ok, "ok">): Ok {
    return {
      ok: true,
      ...input,
    };
  }

  static fail(input: Omit<Fail, "ok">): Fail {
    return {
      ok: false,
      ...input,
    };
  }
}

export class Send {
  static httpStatusToRetryHint(status: number): DestinationRetryHint {
    if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) {
      return "retryable";
    }

    return "not_retryable";
  }

  static transportFailureResult(input: { error: unknown; renderedPayload: JsonValue }) {
    const timedOut = isTimeoutError(input.error);

    return R.fail({
      errorKind: timedOut ? "timeout" : "network_error",
      retryHint: "retryable",
      errorMessage: this.#getTransportError(input.error, timedOut),
      statusCode: null,
      responseBody: null,
      renderedPayload: input.renderedPayload,
    });
  }

  static #getTransportError(error: unknown, timedOut: boolean) {
    const message = errorMessage(error);

    if (timedOut) {
      return message ?? "Destination request timed out";
    }

    return message ? `Destination transport failed: ${message}` : "Destination transport failed";
  }

  static async readResponseBody(response: Pick<FetchLikeResponse, "text">) {
    try {
      return await response.text();
    } catch (error) {
      // A body read that loses the deadline is a failed delivery, not an empty
      // body; other read errors keep the historical "no body" behavior.
      if (isTimeoutError(error)) {
        throw error;
      }

      return "";
    }
  }
}

export class Adapter {
  static define<Kind extends DestinationKind, Schema extends z.ZodType>(
    adapter: DestinationAdapterDefinition<Kind, Schema>,
  ): DestinationAdapter<Kind, z.output<Schema>> {
    return adapter as DestinationAdapter<Kind, z.output<Schema>>;
  }

  static getTransportContext(context: DestinationTransportContext = {}): DestinationTransport {
    const timeoutMs = context.timeoutMs ?? DEFAULT_DESTINATION_TIMEOUT_MS;

    return {
      fetch: createTimeoutFetch(context.fetch ?? getGlobalFetch(), timeoutMs),
      now: context.now ?? (() => new Date()),
      timeoutMs,
    };
  }
}

function errorMessage(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("message" in error)) {
    return null;
  }

  const message = (error as { message?: unknown }).message;

  return typeof message === "string" && message.trim().length > 0 ? message.trim() : null;
}

function getGlobalFetch(): FetchLike {
  if (!globalThis.fetch) {
    throw new Error("No fetch implementation is available for destination delivery");
  }

  return globalThis.fetch;
}
