import type { JsonValue } from "@tocsin/core";

import { zodTemplateDiagnostics } from "#destinations/shared/template-diagnostics";
import { DestinationTemplateEngine } from "#destinations/template";
import { Adapter, R, Send } from "#destinations/utils";

import { genericWebhookManifest } from "./manifest";
import { renderGenericWebhookPayload } from "./payload";
import { GenericWebhookConfigSchema } from "./schema";

/**
 * `Adapter.define` infers the typed config from `configSchema`; the manifest
 * stays a plain JSON-safe object and `preview` / `send` are pure functions.
 */
export const genericWebhookAdapter = Adapter.define({
  manifest: genericWebhookManifest,
  configSchema: GenericWebhookConfigSchema,
  preview(input) {
    const parsedConfig = GenericWebhookConfigSchema.safeParse(input.config);

    if (!parsedConfig.success) {
      // Preview failures are returned as data, never thrown: the console shows
      // these diagnostics next to the field the operator is editing.
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
      const response = await fetch(config.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(renderedPayload),
      });
      const responseBody = await Send.readResponseBody(response);

      if (!response.ok) {
        return R.fail({
          errorKind: "http_error",
          retryHint: Send.httpStatusToRetryHint(response.status),
          errorMessage: `Generic webhook returned HTTP ${response.status}`,
          statusCode: response.status,
          responseBody,
          renderedPayload,
        });
      }

      return R.ok({
        statusCode: response.status,
        responseBody,
        renderedPayload,
      });
    } catch (error) {
      return Send.transportFailureResult({ error, renderedPayload });
    }
  },
});
