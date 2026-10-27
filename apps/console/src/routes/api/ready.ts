import { createFileRoute } from "@tanstack/react-router";

import { getApplicationContainer } from "#/server/runtime/container";
import { evaluateReadiness } from "#/server/runtime/readiness";

export const Route = createFileRoute("/api/ready")({
  server: {
    handlers: {
      GET: async () => {
        const container = getApplicationContainer();
        const result = await evaluateReadiness({
          openStore: () => container.getSqliteStore(),
          ensureWorker: () => container.ensureDeliveryWorkerRunner(),
        });

        return Response.json(result.body, { status: result.status });
      },
    },
  },
});
