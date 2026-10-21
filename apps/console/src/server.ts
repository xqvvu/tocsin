import serverEntry from "@tanstack/react-start/server-entry";
import { FastResponse } from "srvx";

import { env } from "#/env";
import { requireBetterAuthSecret } from "#/lib/auth-config";
import { getApplicationContainer } from "#/server/runtime/container";
import { logger } from "#/server/runtime/logging";
import { loadSystemInformation, logSystemInformation } from "#/server/runtime/system-information";

async function bootstrap() {
  globalThis.Response = FastResponse;

  // Auth is assembled lazily on the first session request, so without this
  // check a production container with a missing or published secret would pass
  // its health check and only fail when an operator tries to log in. Prod
  // fail-fast here keeps `/api/ready` honest.
  requireBetterAuthSecret(env.BETTER_AUTH_SECRET);

  await logger();
  const store = await getApplicationContainer().getSqliteStore();
  const sqliteVersion = await store.sqliteVersion();
  logSystemInformation(loadSystemInformation(sqliteVersion));
}

await bootstrap();

export default serverEntry;
