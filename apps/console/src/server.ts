import { getLogger } from "@logtape/logtape";
import serverEntry from "@tanstack/react-start/server-entry";
import type { ServerEntry } from "@tanstack/react-start/server-entry";
import { FastResponse } from "srvx";

import { env } from "#/env";
import { requireBetterAuthSecret } from "#/lib/auth-config";
import { getApplicationContainer } from "#/server/runtime/container";
import { safeErrorProperties } from "#/server/runtime/log-safety";
import { logger } from "#/server/runtime/logging";
import {
  buildStartupFailureResponse,
  describeStartupFailure,
} from "#/server/runtime/startup-failure";
import type { StartupFailure } from "#/server/runtime/startup-failure";
import { loadSystemInformation, logSystemInformation } from "#/server/runtime/system-information";

const startupLogger = getLogger(["tocsin", "runtime"]);

async function bootstrap(): Promise<StartupFailure | undefined> {
  globalThis.Response = FastResponse;

  // Auth is assembled lazily on the first session request, so without this
  // check a production container with a missing or published secret would pass
  // its health check and only fail when an operator tries to log in. Nitro
  // loads this entry on the first request, so a bad secret makes every request
  // (including `/api/ready`) fail with the actionable error instead of just
  // `/api/auth/*`, and the container health check turns unhealthy.
  requireBetterAuthSecret(env.BETTER_AUTH_SECRET);

  await logger();

  try {
    const store = await getApplicationContainer().getSqliteStore();
    const sqliteVersion = await store.sqliteVersion();
    logSystemInformation(loadSystemInformation(sqliteVersion));
  } catch (error) {
    const failure = describeStartupFailure(error);
    startupLogger.error("SQLite startup failed ({code})", {
      code: failure.code,
      ...safeErrorProperties(error),
    });

    return failure;
  }

  return undefined;
}

const startupFailure = await bootstrap();

// A storage bootstrap failure used to reject module evaluation, so every
// request — including `/api/ready` — got an opaque 500. Keep that behavior for
// application traffic (the stored error is rethrown below), but let readiness
// probes receive the machine-readable reason instead.
const entry: ServerEntry = {
  fetch: (...args: Parameters<typeof serverEntry.fetch>) => {
    const [request] = args;

    if (startupFailure) {
      if (new URL(request.url).pathname === "/api/ready") {
        const response = buildStartupFailureResponse(startupFailure);

        return Response.json(response.body, { status: response.status });
      }

      throw startupFailure.cause;
    }

    return serverEntry.fetch(...args);
  },
};

export default entry;
