import { createFileRoute } from "@tanstack/react-router";

import { openAPIHandler } from "#/server/orpc/handler";

/**
 * OpenAPI surface for the oRPC router: the HTTP API itself plus the generated
 * reference at `/api/openapi/spec.json` and `/api/openapi/docs`.
 *
 * The dashboard uses the RPC protocol on `/api`; this prefix exists so
 * external callers and the generated reference describe the same procedures.
 */
export const Route = createFileRoute("/api/openapi/$")({
  server: {
    handlers: {
      GET: async ({ request }) => await handleOpenApi(request),
      POST: async ({ request }) => await handleOpenApi(request),
      PUT: async ({ request }) => await handleOpenApi(request),
      DELETE: async ({ request }) => await handleOpenApi(request),
      PATCH: async ({ request }) => await handleOpenApi(request),
    },
  },
});

async function handleOpenApi(request: Request): Promise<Response> {
  const { matched, response } = await openAPIHandler.handle(request, {
    prefix: "/api/openapi",
  });
  if (matched) return response;
  return new Response("Not found", { status: 404 });
}
