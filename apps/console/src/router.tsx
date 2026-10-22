import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { createQueryClient } from "#/lib/query-client";
import { routeTree } from "#/route-tree.gen";
import { DashboardErrorPage } from "#/shell/dashboard-error";
import { DashboardNotFoundPage } from "#/shell/dashboard-not-found";

export function getRouter() {
  const context = {
    queryClient: createQueryClient(),
  };

  const router = createTanStackRouter({
    routeTree,
    context,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DashboardErrorPage,
    defaultNotFoundComponent: DashboardNotFoundPage,
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient: context.queryClient,
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
