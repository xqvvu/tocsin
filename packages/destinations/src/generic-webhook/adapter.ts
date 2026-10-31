import type { JsonValue } from "@tocsin/core";

import { genericWebhookManifest } from "#destinations/generic-webhook/manifest";
import { renderGenericWebhookPayload } from "#destinations/generic-webhook/payload";
import { GenericWebhookConfigSchema } from "#destinations/generic-webhook/schema";
import { zodTemplateDiagnostics } from "#destinations/shared/template-diagnostics";
import { DestinationTemplateEngine } from "#destinations/template";
import { Adapter, R, Send } from "#destinations/utils";

export const genericWebhookAdapter = Adapter.define({
  manifest: genericWebhookManifest,
  configSchema: GenericWebhookConfigSchema,
  preview(input) {
    const parsedConfig = GenericWebhookConfigSchema.safeParse(input.config);

    if (!parsedConfig.success) {
      return {
        templateError: {
          diagnostics: zodTemplateDiagnostics(parsedConfig.error),
        },
      };
    }

    return renderGenericWebhookPayload({ ...input, config: parsedConfig.data });
  },
  async send(input, context) {
    const parsedConfig = GenericWebhookConfigSchema.safeParse(input.config);

    if (!parsedConfig.success) {
      return R.fail({
        errorKind: "configuration_error",
        retryHint: "not_retryable",
        errorMessage: "Generic webhook destination configuration is invalid",
        statusCode: null,
        responseBody: null,
        renderedPayload: {
          templateError: {
            diagnostics: zodTemplateDiagnostics(parsedConfig.error),
          },
        },
      });
    }

    const config = parsedConfig.data;
    const { fetch } = Adapter.getTransportContext(context);
    let renderedPayload: JsonValue;

    try {
      renderedPayload = renderGenericWebhookPayload({ ...input, config });
    } catch (error) {
      if (DestinationTemplateEngine.isValidationError(error)) {
        return R.fail({
          errorKind: "configuration_error",
          retryHint: "not_retryable",
          errorMessage: error.message,
          statusCode: null,
          responseBody: null,
          renderedPayload: DestinationTemplateEngine.validationErrorToPayload(error),
        });
      }

      throw error;
    }

    try {
      const response = await fetch(config.url, {
        method: config.method,
        headers: {
          "Content-Type": "application/json",
          // Only a persisted delivery has a stable id; previews and test sends
          // leave the header out. An operator-configured header of the same
          // name still wins, because it is spread last.
          ...(config.idempotencyKey && input.deliveryId
            ? { "Idempotency-Key": input.deliveryId }
            : {}),
          ...config.headers,
        },
        body: JSON.stringify(renderedPayload),
      });
      const responseBody = await Send.readResponseBody(response);

      if (response.ok) {
        return R.ok({
          statusCode: response.status,
          responseBody,
          renderedPayload,
        });
      }

      return R.fail({
        errorKind: "http_error",
        retryHint: Send.httpStatusToRetryHint(response.status),
        errorMessage: `Generic webhook returned HTTP ${response.status}`,
        statusCode: response.status,
        responseBody,
        renderedPayload,
      });
    } catch (error) {
      return Send.transportFailureResult({ error, renderedPayload });
    }
  },
});

export const genericWebhookSender = genericWebhookAdapter;
