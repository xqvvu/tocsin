import type { DestinationKind, JsonValue } from "@tocsin/core";
import type { z } from "zod";

import type {
  DestinationAdapter,
  DestinationAdapterDefinition,
  DestinationRetryHint,
  DestinationSendResult,
  DestinationTransportContext,
  FetchLike,
  FetchLikeResponse,
} from "#destinations/types";

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
    return R.fail({
      errorKind: "network_error",
      retryHint: "retryable",
      errorMessage: this.#getTransportError(input.error),
      statusCode: null,
      responseBody: null,
      renderedPayload: input.renderedPayload,
    });
  }

  static #getTransportError(error: unknown) {
    return error instanceof Error && error.message.trim()
      ? `Destination transport failed: ${error.message}`
      : "Destination transport failed";
  }

  static async readResponseBody(response: Pick<FetchLikeResponse, "text">) {
    try {
      return await response.text();
    } catch {
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

  static getTransportContext(
    context: DestinationTransportContext = {},
  ): Required<DestinationTransportContext> {
    return {
      fetch: context.fetch ?? getGlobalFetch(),
      now: context.now ?? (() => new Date()),
    };
  }
}

function getGlobalFetch(): FetchLike {
  if (!globalThis.fetch) {
    throw new Error("No fetch implementation is available for destination delivery");
  }

  return globalThis.fetch;
}
