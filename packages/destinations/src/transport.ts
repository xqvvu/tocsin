import type { FetchLike } from "#destinations/types";

/**
 * Upper bound for one outbound destination HTTP request.
 *
 * A hung target must fail faster than the delivery worker's stale-running
 * reclaim window (5 minutes by default), otherwise one unreachable endpoint
 * keeps a claimed delivery `running` until the next process reclaims it. Ten
 * seconds also leaves room for a Feishu app send, which performs a token
 * request followed by a message request, to fail and retry inside that window.
 */
export const DEFAULT_DESTINATION_TIMEOUT_MS = 10_000;

export class DestinationTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Destination request timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Detects both the error this module raises and the DOMException that
 * `AbortSignal.timeout()` / `fetch` produce in runtimes that honor the signal.
 * `DOMException` is not an `Error` subclass in every runtime, so the check is
 * structural rather than `instanceof`.
 */
export function isTimeoutError(error: unknown): boolean {
  if (hasErrorName(error, "TimeoutError")) {
    return true;
  }

  return isObject(error) && hasErrorName(error.cause, "TimeoutError");
}

/**
 * Wraps a fetch implementation with a hard per-request deadline.
 *
 * The signal is passed to the underlying fetch so real implementations abort
 * the socket, and the promise is also raced against the deadline so a fetch
 * double (or a runtime that ignores the signal) cannot hang the worker. The
 * deadline stays armed through `text()` so a response that streams headers but
 * never finishes its body still fails as a timeout rather than as a success.
 *
 * `timeoutMs <= 0` disables the deadline; tests that deliberately simulate a
 * hung process use it to keep the attempt in flight.
 */
export function createTimeoutFetch(fetch: FetchLike, timeoutMs: number): FetchLike {
  if (timeoutMs <= 0) {
    return fetch;
  }

  return async (url, init) => {
    const controller = new AbortController();
    const timeoutError = new DestinationTimeoutError(timeoutMs);
    const externalSignal = init.signal;
    const forwardAbort = () => controller.abort(externalSignal?.reason);
    const timer = setTimeout(() => controller.abort(timeoutError), timeoutMs);

    if (externalSignal) {
      if (externalSignal.aborted) {
        forwardAbort();
      } else {
        externalSignal.addEventListener("abort", forwardAbort, { once: true });
      }
    }

    const cleanup = () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", forwardAbort);
    };

    try {
      const response = await raceWithAbort(
        fetch(url, { ...init, signal: controller.signal }),
        controller.signal,
        timeoutError,
      );

      return {
        ok: response.ok,
        status: response.status,
        async text() {
          try {
            return await raceWithAbort(response.text(), controller.signal, timeoutError);
          } finally {
            cleanup();
          }
        },
      };
    } catch (error) {
      cleanup();
      throw error;
    }
  };
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal, fallback: Error): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? fallback);
  }

  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason ?? fallback), { once: true });
    }),
  ]);
}

function hasErrorName(error: unknown, name: string): boolean {
  return isObject(error) && error.name === name;
}

function isObject(value: unknown): value is { name?: unknown; cause?: unknown } {
  return typeof value === "object" && value !== null;
}
