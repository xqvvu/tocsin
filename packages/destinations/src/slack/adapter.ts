import type { JsonValue } from "@tocsin/core";
import type { z } from "zod";

import { slackManifest } from "#destinations/slack/manifest";
import { renderSlackPayload } from "#destinations/slack/payload";
import { SlackConfigSchema } from "#destinations/slack/schema";
import { DestinationTemplateEngine } from "#destinations/template";
import { Adapter, R, Send } from "#destinations/utils";

export const slackAdapter = Adapter.define({
  manifest: slackManifest,
  configSchema: SlackConfigSchema,
  preview(input) {
    const parsedConfig = SlackConfigSchema.safeParse(input.config);

    if (!parsedConfig.success) {
      return {
        templateError: {
          diagnostics: zodTemplateDiagnostics(parsedConfig.error),
        },
      };
    }

    return renderSlackPayload({ ...input, config: parsedConfig.data });
  },
  async send(input, context) {
    const parsedConfig = SlackConfigSchema.safeParse(input.config);

    if (!parsedConfig.success) {
      return R.fail({
        errorKind: "configuration_error",
        retryHint: "not_retryable",
        errorMessage: "Slack destination configuration is invalid",
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
      renderedPayload = renderSlackPayload({ ...input, config });
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
      const slackOk = responseBody.trim().toLocaleLowerCase() === "ok";

      if (response.ok && slackOk) {
        return R.ok({
          statusCode: response.status,
          responseBody,
          renderedPayload,
        });
      }

      return R.fail({
        errorKind: response.ok ? "target_rejected" : "http_error",
        retryHint: response.ok ? "not_retryable" : Send.httpStatusToRetryHint(response.status),
        errorMessage: response.ok
          ? `Slack webhook returned ${responseBody || "an unexpected response"}`
          : `Slack webhook returned HTTP ${response.status}`,
        statusCode: response.status,
        responseBody,
        renderedPayload,
      });
    } catch (error) {
      return Send.transportFailureResult({ error, renderedPayload });
    }
  },
});

export const slackSender = slackAdapter;

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
