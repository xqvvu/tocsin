import type { JsonValue } from "@tocsin/core";
import type { z } from "zod";

import { genericWebhookManifest } from "#destinations/generic-webhook/manifest";
import { renderGenericWebhookPayload } from "#destinations/generic-webhook/payload";
import { GenericWebhookConfigSchema } from "#destinations/generic-webhook/schema";
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

/**
 * Flattens a zod config failure into the same diagnostic shape the template
 * engine emits, so the console renders template errors through one path.
 */
function zodTemplateDiagnostics(error: z.ZodError) {
  return error.issues.map((issue) => ({
    severity: "error" as const,
    path: issue.path.join(".") || null,
    variable: variableFromTemplateIssue(issue.message),
    message: issue.message,
  }));
}

function variableFromTemplateIssue(message: string): string | null {
  const match = /^Destination template contains unknown variable: (.+)$/.exec(message);

  return match?.[1] ?? null;
}
