import type { JsonValue } from "@tocsin/core";
import type { z } from "zod";

import { emailManifest } from "#destinations/email/manifest";
import { renderEmailPayload, renderEmailRequestPayload } from "#destinations/email/payload";
import { EmailConfigSchema } from "#destinations/email/schema";
import { DestinationTemplateEngine } from "#destinations/template";
import { Adapter, R, Send } from "#destinations/utils";

export const emailAdapter = Adapter.define({
  manifest: emailManifest,
  configSchema: EmailConfigSchema,
  preview(input) {
    const parsedConfig = EmailConfigSchema.safeParse(input.config);

    if (!parsedConfig.success) {
      return {
        templateError: {
          diagnostics: zodTemplateDiagnostics(parsedConfig.error),
        },
      };
    }

    return renderEmailPayload({ ...input, config: parsedConfig.data }, parsedConfig.data);
  },
  async send(input, context) {
    const parsedConfig = EmailConfigSchema.safeParse(input.config);

    if (!parsedConfig.success) {
      return R.fail({
        errorKind: "configuration_error",
        retryHint: "not_retryable",
        errorMessage: "Email destination configuration is invalid",
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

    // Render before touching the transport: a bad template is an operator
    // mistake, so it must fail as a non-retryable configuration error without
    // ever reaching the gateway.
    try {
      renderedPayload = renderEmailPayload({ ...input, config }, config);
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
    const requestPayload = renderEmailRequestPayload({ ...input, config }, config);

    try {
      const response = await fetch(config.endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...config.headers,
        },
        body: JSON.stringify(requestPayload),
      });
      const responseBody = await Send.readResponseBody(response);

      if (response.ok) {
        return R.ok({ statusCode: response.status, responseBody, renderedPayload });
      }

      return R.fail({
        errorKind: "http_error",
        retryHint: Send.httpStatusToRetryHint(response.status),
        errorMessage: `Email gateway returned HTTP ${response.status}`,
        statusCode: response.status,
        responseBody,
        renderedPayload,
      });
    } catch (error) {
      return Send.transportFailureResult({ error, renderedPayload });
    }
  },
});

export const emailSender = emailAdapter;

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
