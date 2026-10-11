import type { JsonValue } from "@tocsin/core";
import { z } from "zod";

import { feishuManifest } from "#destinations/feishu/manifest";
import {
  renderFeishuPreviewPayload,
  renderFeishuSendMessage,
  renderFeishuWirePayload,
} from "#destinations/feishu/payload";
import { FeishuConfigSchema } from "#destinations/feishu/schema";
import type { FeishuConfig } from "#destinations/feishu/schema";
import { fetchFeishuTenantAccessToken } from "#destinations/shared/feishu-app-client";
import { FEISHU_MESSAGES_URL } from "#destinations/shared/feishu-endpoints";
import {
  feishuErrorDecision,
  feishuErrorKind,
  withOperatorHint,
} from "#destinations/shared/feishu-errors";
import { FEISHU_JSON_CONTENT_TYPE } from "#destinations/shared/feishu-protocol";
import {
  feishuBusinessCode,
  feishuFailureMessage,
  feishuFailureSummary,
  feishuMessageId,
  isFeishuSuccess,
  parseFeishuResult,
} from "#destinations/shared/feishu-result";
import { DestinationTemplateEngine } from "#destinations/template";
import type {
  DestinationSendInput,
  DestinationSendResult,
  DestinationTransportContext,
} from "#destinations/types";
import { Adapter, R, Send } from "#destinations/utils";

export const feishuAdapter = Adapter.define({
  manifest: feishuManifest,
  configSchema: FeishuConfigSchema,
  preview(input) {
    const config = FeishuConfigSchema.parse(input.config);

    return renderFeishuPreviewPayload(input, config);
  },
  async send(input, context) {
    const parsedConfig = FeishuConfigSchema.safeParse(input.config);

    if (!parsedConfig.success) {
      return R.fail({
        errorKind: "configuration_error",
        retryHint: "not_retryable",
        errorMessage: "Feishu destination configuration is invalid",
        statusCode: null,
        responseBody: null,
        renderedPayload: {
          templateError: {
            diagnostics: zodTemplateDiagnostics(parsedConfig.error),
          },
        },
      });
    }

    return parsedConfig.data.sendMode === "app"
      ? sendViaApp(input, parsedConfig.data, context)
      : sendViaWebhook(input, parsedConfig.data, context);
  },
});

export const feishuSender = feishuAdapter;

/**
 * Custom group-bot webhook (the original send path): the signed payload goes to
 * the operator's webhook URL and the response carries no message handle.
 */
async function sendViaWebhook(
  input: DestinationSendInput<FeishuConfig>,
  config: FeishuConfig,
  context: DestinationTransportContext | undefined,
): Promise<DestinationSendResult> {
  const webhookUrl = config.webhookUrl;

  if (!webhookUrl) {
    // The schema requires a webhook URL in this mode; the guard keeps a
    // hand-crafted config from crashing the worker.
    return R.fail({
      errorKind: "configuration_error",
      retryHint: "not_retryable",
      errorMessage: "Feishu webhook send mode requires a webhook URL",
      statusCode: null,
      responseBody: null,
      renderedPayload: {},
    });
  }

  const { fetch, now } = Adapter.getTransportContext(context);
  let renderedPayload: JsonValue;
  let signedPayload: JsonValue;

  try {
    renderedPayload = renderFeishuPreviewPayload(input, config);
    signedPayload = await renderFeishuWirePayload(input, config, now);
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
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(signedPayload),
    });
    const responseBody = await Send.readResponseBody(response);
    const feishuResult = parseFeishuResult(responseBody);
    const feishuOk = feishuResult ? isFeishuSuccess(feishuResult) : response.ok;
    const code = feishuBusinessCode(feishuResult);
    const decision = feishuErrorDecision(code, response.status);

    if (response.ok && feishuOk) {
      return R.ok({
        statusCode: response.status,
        responseBody,
        renderedPayload,
      });
    }

    return R.fail({
      errorKind: feishuErrorKind(code),
      // The platform answers a rate-limited custom-bot send with a body-level
      // code (11232) and HTTP 200/400, so the code — not the status — decides
      // whether the card can be posted again.
      retryHint:
        decision.retryHint === "retryable"
          ? "retryable"
          : response.ok
            ? "not_retryable"
            : Send.httpStatusToRetryHint(response.status),
      errorMessage: withOperatorHint(
        feishuResult
          ? feishuFailureSummary(feishuResult, response.status)
          : `Feishu webhook returned HTTP ${response.status}`,
        decision.operatorHint,
      ),
      statusCode: response.status,
      responseBody,
      renderedPayload,
    });
  } catch (error) {
    return Send.transportFailureResult({ error, renderedPayload });
  }
}

/**
 * App send mode: the registered app posts the card to the target group and the
 * response's `message_id` becomes the delivery's provider reference, which is
 * what a later urgent phone call acts on.
 *
 * The credential is resolved server-side (console) from `app.appRef` before the
 * send; a config that reaches the adapter without it is a non-retryable
 * configuration error.
 */
async function sendViaApp(
  input: DestinationSendInput<FeishuConfig>,
  config: FeishuConfig,
  context: DestinationTransportContext | undefined,
): Promise<DestinationSendResult> {
  let renderedPayload: JsonValue;

  try {
    renderedPayload = renderFeishuPreviewPayload(input, config);
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

  const app = config.app;

  if (!app?.appId || !app.appSecret) {
    return R.fail({
      errorKind: "configuration_error",
      retryHint: "not_retryable",
      errorMessage: "Feishu app credentials were not resolved for this send",
      statusCode: null,
      responseBody: null,
      renderedPayload,
    });
  }

  const { fetch } = Adapter.getTransportContext(context);
  const token = await fetchFeishuTenantAccessToken(
    { appId: app.appId, appSecret: app.appSecret },
    context,
  );

  if (!token.ok) {
    return R.fail({
      errorKind: token.errorKind,
      retryHint: token.retryHint,
      errorMessage: token.errorMessage,
      statusCode: token.statusCode,
      responseBody: token.responseBody,
      renderedPayload,
    });
  }

  const message = renderFeishuSendMessage(input, config);

  try {
    const response = await fetch(`${FEISHU_MESSAGES_URL}?receive_id_type=chat_id`, {
      method: "POST",
      headers: {
        "Content-Type": FEISHU_JSON_CONTENT_TYPE,
        Authorization: `Bearer ${token.tenantAccessToken}`,
      },
      body: JSON.stringify({
        receive_id: app.chatId,
        msg_type: message.msgType,
        content: message.content,
      }),
    });
    const responseBody = await Send.readResponseBody(response);
    const result = parseFeishuResult(responseBody);
    const code = feishuBusinessCode(result);

    if (!response.ok) {
      const decision = feishuErrorDecision(code, response.status);

      return R.fail({
        errorKind: feishuErrorKind(code),
        retryHint:
          decision.retryHint === "retryable"
            ? "retryable"
            : Send.httpStatusToRetryHint(response.status),
        errorMessage: withOperatorHint(
          feishuFailureSummary(result, response.status),
          decision.operatorHint,
        ),
        statusCode: response.status,
        responseBody,
        renderedPayload,
      });
    }

    if (!result || code !== 0) {
      const decision = feishuErrorDecision(code, response.status);

      return R.fail({
        errorKind: "target_rejected",
        retryHint: decision.retryHint,
        errorMessage: withOperatorHint(
          feishuFailureMessage(result, "Feishu returned an unreadable send message response"),
          decision.operatorHint,
        ),
        statusCode: response.status,
        responseBody,
        renderedPayload,
      });
    }

    const messageId = feishuMessageId(result);

    return R.ok({
      statusCode: response.status,
      responseBody,
      renderedPayload,
      ...(messageId ? { providerReference: { type: "feishu_message_id", value: messageId } } : {}),
    });
  } catch (error) {
    return Send.transportFailureResult({ error, renderedPayload });
  }
}

function zodTemplateDiagnostics(error: z.ZodError) {
  return error.issues.map((issue) => ({
    severity: "error",
    path: issue.path.join(".") || null,
    variable: variableFromTemplateIssue(issue.message),
    message: issue.message,
  }));
}

function variableFromTemplateIssue(message: string): string | null {
  const match = /^Destination template contains unknown variable: (.+)$/.exec(message);

  return match?.[1] ?? null;
}
