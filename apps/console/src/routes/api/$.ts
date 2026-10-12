import { createFileRoute } from "@tanstack/react-router";

import { rpcHandler } from "#/server/orpc/handler";

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: async ({ request }) => await handleRpc(request),
      POST: async ({ request }) => await handleRpc(request),
      PUT: async ({ request }) => await handleRpc(request),
      DELETE: async ({ request }) => await handleRpc(request),
      PATCH: async ({ request }) => await handleRpc(request),
    },
  },
});

async function handleRpc(request: Request): Promise<Response> {
  const { matched, response } = await rpcHandler.handle(request, { prefix: "/api" });
  if (matched) return response;
  return new Response("Not found", { status: 404 });
}
