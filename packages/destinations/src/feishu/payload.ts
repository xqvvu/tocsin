import { createStableHash } from "@tocsin/core";
import type { JsonObject, JsonValue } from "@tocsin/core";

import { resolveBuiltInFeishuCardTemplate } from "#destinations/feishu/default-card";
import { createFastgptModelProbeCardTemplate } from "#destinations/feishu/fastgpt-card";
import type { FeishuConfig } from "#destinations/feishu/schema";
import { createFeishuSign } from "#destinations/feishu/sign";
import { DestinationTemplateEngine } from "#destinations/template";
import type { DestinationSendInput } from "#destinations/types";

// Pin this behavior to the shipped example, not arbitrary operator templates.
const UPTIME_KUMA_EXAMPLE_CARD_HASH = "d9f057a6";

export function renderFeishuPreviewPayload(
  input: DestinationSendInput<FeishuConfig>,
  config: FeishuConfig,
): JsonValue {
  const context = DestinationTemplateEngine.createRenderContext(input);

  if (config.template.source === "builtin" || config.template.mode === "feishu_card") {
    const isFastgptUptimeExample =
      input.source.provider === "fastgpt" &&
      config.template.source === "custom" &&
      config.template.mode === "feishu_card" &&
      isUptimeKumaExampleCard(config.template.card);
    const useFastgptCard =
      input.source.provider === "fastgpt" &&
      (config.template.source === "builtin" || isFastgptUptimeExample);
    const card = useFastgptCard
      ? createFastgptModelProbeCardTemplate({ event: input.normalizedEvent })
      : config.template.source === "builtin"
        ? resolveBuiltInFeishuCardTemplate(config.template)
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

function isUptimeKumaExampleCard(card: JsonObject): boolean {
  return createStableHash(card) === UPTIME_KUMA_EXAMPLE_CARD_HASH;
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
