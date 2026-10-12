import { destinationsRouter } from "#/server/orpc/features/destinations/router";
import { healthRouter } from "#/server/orpc/features/health/router";
import { i18nRouter } from "#/server/orpc/features/i18n/router";
import { integrationsRouter } from "#/server/orpc/features/integrations/router";
import { operationsRouter } from "#/server/orpc/features/operations/router";
import { portabilityRouter } from "#/server/orpc/features/portability/router";
import { routesRouter } from "#/server/orpc/features/routes/router";
import { sessionRouter } from "#/server/orpc/features/session/router";
import { settingsRouter } from "#/server/orpc/features/settings/router";
import { sourcesRouter } from "#/server/orpc/features/sources/router";
import { os } from "#/server/orpc/os";

export const router = os.router({
  // NOT `auth`: better-auth owns the /api/auth/* URL space, and a nested
  // route wins over the RPC splat, so an `auth` segment here would be
  // unreachable from the browser (every call 404s while SSR keeps working,
  // because the server path calls the router directly). Named for what it
  // actually exposes: the dashboard's own session bootstrap.
  session: sessionRouter,
  destinations: destinationsRouter,
  health: healthRouter,
  i18n: i18nRouter,
  integrations: integrationsRouter,
  operations: operationsRouter,
  portability: portabilityRouter,
  routes: routesRouter,
  settings: settingsRouter,
  sources: sourcesRouter,
});
