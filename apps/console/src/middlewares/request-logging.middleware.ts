import { getLogger, withContext } from "@logtape/logtape";
import { createMiddleware } from "@tanstack/react-start";

import { elapsedMs } from "#/lib/utils";
import { safeErrorProperties } from "#/server/runtime/log-safety";

const httpLogger = getLogger(["tocsin", "http"]);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const PROBE_PATHS = new Set(["/api/health", "/api/ready"]);

export const requestLoggingMiddleware = createMiddleware({ type: "request" }).server(
  async ({ request, pathname, handlerType, next }) => {
    const requestId = resolveRequestId(request.headers);
    const startedAt = performance.now();

    request.headers.set("x-request-id", requestId);

    return withContext({ requestId }, async () => {
      try {
        const result = await next({
          context: {
            requestId,
          },
        });
        const durationMs = elapsedMs(startedAt);
        const response = withRequestIdHeader(result.response, requestId);

        logCompletedRequest({
          method: request.method,
          pathname,
          handlerType,
          status: response.status,
          durationMs,
        });

        return response === result.response ? result : { ...result, response };
      } catch (error) {
        httpLogger.error("HTTP request failed", {
          method: request.method,
          pathname,
          handlerType,
          durationMs: elapsedMs(startedAt),
          ...safeErrorProperties(error),
        });

        throw error;
      }
    });
  },
);

export function resolveRequestId(headers: Headers): string {
  const candidate = headers.get("x-request-id") ?? headers.get("x-correlation-id");

  return candidate && REQUEST_ID_PATTERN.test(candidate) ? candidate : crypto.randomUUID();
}

function logCompletedRequest(input: {
  method: string;
  pathname: string;
  handlerType: "router" | "serverFn";
  status: number;
  durationMs: number;
}): void {
  const properties = {
    method: input.method,
    pathname: input.pathname,
    handlerType: input.handlerType,
    status: input.status,
    durationMs: input.durationMs,
  };

  if (input.status >= 500) {
    httpLogger.error("HTTP {method} {pathname} completed with {status}", properties);
  } else if (input.status >= 400) {
    httpLogger.warn("HTTP {method} {pathname} completed with {status}", properties);
  } else if (PROBE_PATHS.has(input.pathname)) {
    httpLogger.debug("HTTP {method} {pathname} completed with {status}", properties);
  } else {
    httpLogger.info("HTTP {method} {pathname} completed with {status}", properties);
  }
}

function withRequestIdHeader(response: Response, requestId: string): Response {
  try {
    response.headers.set("x-request-id", requestId);
    return response;
  } catch {
    const headers = new Headers(response.headers);

    headers.set("x-request-id", requestId);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}
