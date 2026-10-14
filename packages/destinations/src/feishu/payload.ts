import type { JsonObject, JsonValue } from "@tocsin/core";

import { resolveBuiltInFeishuCardTemplate } from "#destinations/feishu/default-card";
import { createFastgptModelProbeCardTemplate } from "#destinations/feishu/fastgpt-card";
import type { FeishuConfig } from "#destinations/feishu/schema";
import { createFeishuSign } from "#destinations/feishu/sign";
import { DestinationTemplateEngine } from "#destinations/template";
import type { DestinationSendInput } from "#destinations/types";

export function renderFeishuPreviewPayload(
  input: DestinationSendInput<FeishuConfig>,
  config: FeishuConfig,
): JsonValue {
  const context = DestinationTemplateEngine.createRenderContext(input);

  if (config.template.source === "builtin" || config.template.mode === "feishu_card") {
    const card =
      config.template.source === "builtin"
        ? input.source.provider === "fastgpt"
          ? createFastgptModelProbeCardTemplate({ event: input.normalizedEvent })
          : resolveBuiltInFeishuCardTemplate(config.template)
        : config.template.card;

    return {
      msg_type: "interactive",
      card: DestinationTemplateEngine.renderJsonOrThrow(
        context,
        card,
        "template.card",
        config.template.bindings,
      ),
    };
  }

  return {
    msg_type: "text",
    content: {
      text: DestinationTemplateEngine.renderTextOrThrow(
        context,
        config.template.text,
        "template.text",
        config.template.bindings,
      ),
    },
  };
}

export async function renderFeishuWirePayload(
  input: DestinationSendInput<FeishuConfig>,
  config: FeishuConfig,
  now: () => Date = () => new Date(),
): Promise<JsonValue> {
  const payload = renderFeishuPreviewPayload(input, config) as JsonObject;

  if (config.signSecret) {
    const timestamp = Math.floor(now().valueOf() / 1000).toString();
    payload.timestamp = timestamp;
    payload.sign = await createFeishuSign(timestamp, config.signSecret);
  }

  return payload;
}

/**
 * Builds the message body for the app send API (`POST /im/v1/messages`).
 *
 * Unlike the webhook wire payload this carries no timestamp or signature — the
 * app authenticates with a tenant access token — and the message content is a
 * JSON *string*: the card object for interactive messages, `{"text": ...}` for
 * text messages.
 */
export function renderFeishuSendMessage(
  input: DestinationSendInput<FeishuConfig>,
  config: FeishuConfig,
): { msgType: "text" | "interactive"; content: string } {
  const payload = renderFeishuPreviewPayload(input, config) as JsonObject;

  if (payload.msg_type === "text") {
    return { msgType: "text", content: JSON.stringify(payload.content ?? { text: "" }) };
  }

  return { msgType: "interactive", content: JSON.stringify(payload.card ?? {}) };
}
