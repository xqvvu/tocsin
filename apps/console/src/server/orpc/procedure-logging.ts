import { getLogger } from "@logtape/logtape";
import { COMMON_ERROR_STATUS_MAP, ORPCError, os } from "@orpc/server";

import { elapsedMs } from "#/lib/utils";
import { safeErrorProperties } from "#/server/runtime/log-safety";

const orpcLogger = getLogger(["tocsin", "orpc"]);

/**
 * Logs failed oRPC procedure calls with the resolved procedure path and code.
 *
 * Successful browser calls are already covered by the HTTP request-logging
 * middleware (`POST /api/rpc/<path>` reaches it with status and duration), so
 * this middleware records failures only. It runs on the shared `os`
 * implementer, which means it sees both transports a dashboard call can take:
 *
 * - the browser RPC transport (`RPCHandler` on `/api/rpc`), and
 * - in-process SSR calls (`createRouterClient` in `#/lib/orpc`), which never
 *   reach the handler and would otherwise be silent when they throw.
 *
 * The request id comes for free: the HTTP request middleware opens
 * `withContext({ requestId })` around the whole call chain, including SSR, so
 * procedure failures join the same request as the HTTP access log.
 *
 * It is registered outside `translateErrors` on `os`, so errors reaching this
 * catch are already typed `ORPCError`s with the real domain code. Severity
 * follows the HTTP status the code maps to: deliberate client-facing
 * rejections (guard 401/403, `NOT_FOUND`, validation `BAD_REQUEST`) log at
 * `warn`; genuine server faults (`INTERNAL_SERVER_ERROR` and unmapped codes)
 * log at `error`. Untranslated errors log at `error`. This mirrors the
 * level policy of oRPC's logging integrations.
 *
 * The root middleware chain is re-applied by every `os.<ns>.router(...)` and
 * the final `os.router(...)`, so this middleware would otherwise run once per
 * nesting level and log the same failure repeatedly. It dedupes on a context
 * flag: only the outermost pass records, which is the one that sees the
 * translated code and the full duration.
 */
export function procedureLogging() {
  return os.$context<{ procedureLogged?: true }>().middleware(async ({ context, path, next }) => {
    if (context.procedureLogged) {
      return next();
    }

    const startedAt = performance.now();

    try {
      return await next({ context: { procedureLogged: true } });
    } catch (error) {
      logFailedProcedure(path, error, startedAt);

      throw error;
    }
  });
}

function logFailedProcedure(path: readonly string[], error: unknown, startedAt: number): void {
  const properties = {
    procedure: path.join("."),
    durationMs: elapsedMs(startedAt),
    ...describeError(error),
  };

  if (isServerFault(error)) {
    orpcLogger.error("oRPC {procedure} failed with {errorCode}", properties);
  } else {
    orpcLogger.warn("oRPC {procedure} rejected with {errorCode}", properties);
  }
}

function describeError(error: unknown) {
  const safe = safeErrorProperties(error);

  return error instanceof ORPCError
    ? { errorCode: error.code, ...safe }
    : { errorCode: "INTERNAL_SERVER_ERROR", ...safe };
}

function isServerFault(error: unknown): boolean {
  if (!(error instanceof ORPCError)) {
    return true;
  }

  const status = COMMON_ERROR_STATUS_MAP[error.code as keyof typeof COMMON_ERROR_STATUS_MAP];

  return (status ?? 500) >= 500;
}
