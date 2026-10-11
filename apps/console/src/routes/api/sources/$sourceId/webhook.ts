import { createFileRoute } from "@tanstack/react-router";

import { env } from "#/env";
import { WebhookIntakeError } from "#/server/intake/intake.service";
import {
  InvalidWebhookJsonError,
  readWebhookJsonPayload,
  WebhookPayloadTooLargeError,
} from "#/server/intake/webhook-request";
import type { ApplicationContainer } from "#/server/runtime/container";
import { createWebhookRequestContext } from "#/server/runtime/request-context";

export const Route = createFileRoute("/api/sources/$sourceId/webhook")({
  server: {
    handlers: {
      POST: ({ params, request }) => {
        return handleSourceWebhookPost({ sourceId: params.sourceId, request });
      },
    },
  },
});

export async function handleSourceWebhookPost(input: {
  sourceId: string;
  request: Request;
  container?: ApplicationContainer;
}): Promise<Response> {
  const context = createWebhookRequestContext({
    container: input.container,
    request: input.request,
  });

  if (!context.sourceToken && !context.hasProviderSecret) {
    return Response.json({ error: "Missing source credentials" }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = await readWebhookJsonPayload(input.request, {
      maxBytes: env.TOCSIN_MAX_WEBHOOK_BYTES,
    });
  } catch (error) {
    if (error instanceof WebhookPayloadTooLargeError) {
      return Response.json({ error: error.message }, { status: 413 });
    }

    if (!(error instanceof InvalidWebhookJsonError)) {
      throw error;
    }

    return Response.json({ error: "Expected JSON webhook payload" }, { status: 400 });
  }

  const service = await context.container.createWebhookIntakeService();

  try {
    const result = await service.acceptWebhook({
      sourceId: input.sourceId,
      token: context.sourceToken,
      headers: context.headersRecord,
      payload,
      receivedAt: context.now,
    });

    return Response.json(
      {
        accepted: true,
        eventId: result.eventId,
        deliveriesCreated: result.createdDeliveryIds.length,
        deliveriesDeduped: result.dedupedDeliveryCount,
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof WebhookIntakeError) {
      return Response.json(
        {
          error: error.message,
          eventId: error.eventId,
        },
        { status: statusForWebhookIntakeError(error) },
      );
    }

    throw error;
  }
}

function statusForWebhookIntakeError(error: WebhookIntakeError): number {
  switch (error.reason) {
    case "source_not_found":
      return 404;
    case "source_disabled":
      return 403;
    case "invalid_token":
      return 401;
    case "provider_parse_failed":
      return 400;
  }
}
