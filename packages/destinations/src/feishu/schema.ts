import { AlertSeveritySchema } from "@vane/core";
import { z } from "zod";

import { defaultFeishuCardBindings, FeishuCardColors } from "#destinations/feishu/appearance";
import {
  BUILT_IN_FEISHU_ALERT_CARD_ID,
  BUILT_IN_FEISHU_ALERT_CARD_VERSION,
  resolveBuiltInFeishuCardTemplate,
} from "#destinations/feishu/default-card";
import { FEISHU_MAX_URGENT_RECEIVERS } from "#destinations/shared/feishu-protocol";
import {
  FeishuCardDestinationTemplateSchema,
  TemplateBindingsSchema,
  TextDestinationTemplateSchema,
} from "#destinations/template";

const FeishuCardColorSet: ReadonlySet<string> = new Set(FeishuCardColors);
const NonEmptyFeishuStringSchema = z.string().trim().min(1);

/** Platform limit for one urgent call's receiver list (`user_id_list` ≤ 200). */
export const MAX_URGENT_RECEIVERS = FEISHU_MAX_URGENT_RECEIVERS;

export const BuiltInFeishuDestinationTemplateSchema = z.strictObject({
  source: z.literal("builtin"),
  id: z.literal(BUILT_IN_FEISHU_ALERT_CARD_ID),
  version: z.literal(BUILT_IN_FEISHU_ALERT_CARD_VERSION),
  bindings: TemplateBindingsSchema.optional(),
});

// Feishu only offers its own two modes; the shared engine's other modes
// (e.g. json_payload) must never become selectable on a Feishu destination.
const FeishuCustomDestinationTemplateSchema = z.discriminatedUnion("mode", [
  TextDestinationTemplateSchema,
  FeishuCardDestinationTemplateSchema,
]);

const FeishuDestinationTemplateSchema = z
  .union([BuiltInFeishuDestinationTemplateSchema, FeishuCustomDestinationTemplateSchema])
  .transform((template) => {
    if (template.source === "builtin") {
      return template;
    }

    return { ...template, source: "custom" as const };
  })
  .superRefine((template, context) => {
    const card =
      template.source === "builtin"
        ? resolveBuiltInFeishuCardTemplate(template)
        : template.mode === "feishu_card"
          ? template.card
          : null;

    if (!card) {
      return;
    }

    for (const bindingName of feishuColorBindingNames(card)) {
      const binding = template.bindings?.[bindingName];

      if (!binding) {
        continue;
      }

      for (const [caseName, value] of Object.entries(binding.cases)) {
        if (!FeishuCardColorSet.has(value)) {
          context.addIssue({
            code: "custom",
            path: ["bindings", bindingName, "cases", caseName],
            message: `Feishu card color binding contains unsupported color: ${value}`,
          });
        }
      }

      if (!FeishuCardColorSet.has(binding.fallback)) {
        context.addIssue({
          code: "custom",
          path: ["bindings", bindingName, "fallback"],
          message: `Feishu card color binding contains unsupported color: ${binding.fallback}`,
        });
      }
    }
  });

export const defaultFeishuTextTemplate =
  "[{{event.severity}}] {{event.title}}\n{{event.message}}\nStatus: {{event.status}}\nSource: {{source.name}}\nFingerprint: {{event.fingerprint}}\nOccurred at: {{event.occurredAt}}\nEvent ID: {{event.id}}";

export const FeishuSendModeSchema = z.enum(["webhook", "app"]);
export type FeishuSendMode = z.output<typeof FeishuSendModeSchema>;

export const FeishuUrgentUserIdTypeSchema = z.enum(["open_id", "user_id", "union_id"]);
export type FeishuUrgentUserIdType = z.output<typeof FeishuUrgentUserIdTypeSchema>;

/**
 * App send mode target: the registered Feishu app (`appRef`) that sends the
 * card and the group chat it posts to.
 *
 * `appId` / `appSecret` are resolved server-side from the referenced app just
 * before a send and are never persisted — the stored config carries the
 * reference only, so rotating the credential does not touch destinations. A
 * send that reaches the adapter without resolved credentials fails as a
 * non-retryable configuration error instead of calling Feishu unauthenticated.
 */
const FeishuAppTargetSchema = z.strictObject({
  appRef: NonEmptyFeishuStringSchema,
  chatId: NonEmptyFeishuStringSchema,
  appId: NonEmptyFeishuStringSchema.optional(),
  appSecret: z.string().min(1).optional(),
});

/**
 * Urgent phone configuration on an app-mode destination.
 *
 * `autoEnabled: false` keeps the block manual-only; the severity gate and
 * receivers still apply. Webhook mode rejects the block outright: a
 * webhook-sent message carries no provider reference, so paging could never
 * fire and the configuration would be silently dead.
 *
 * The receiver cap is the platform's own per-call limit for the urgent
 * endpoints (`user_id_list` 列表长度不能大于 200); rejecting it at save time
 * keeps an operator from building a destination that fails on every page.
 */
const FeishuUrgentSchema = z.strictObject({
  autoEnabled: z.boolean(),
  severities: z.array(AlertSeveritySchema).default(["critical"]),
  userIdType: FeishuUrgentUserIdTypeSchema.default("open_id"),
  receivers: z
    .array(NonEmptyFeishuStringSchema)
    .min(1)
    .max(MAX_URGENT_RECEIVERS, {
      message: `Feishu urgent receivers cannot exceed ${MAX_URGENT_RECEIVERS}`,
    })
    .refine((receivers) => new Set(receivers).size === receivers.length, {
      message: "Feishu urgent receivers must be unique",
    }),
});

export const FeishuConfigSchema = z
  .strictObject({
    sendMode: FeishuSendModeSchema.default("webhook"),
    webhookUrl: z.url().optional(),
    signSecret: z.string().min(1).optional(),
    app: FeishuAppTargetSchema.optional(),
    urgent: FeishuUrgentSchema.optional(),
    template: FeishuDestinationTemplateSchema.default({
      source: "builtin",
      id: BUILT_IN_FEISHU_ALERT_CARD_ID,
      version: BUILT_IN_FEISHU_ALERT_CARD_VERSION,
      bindings: defaultFeishuCardBindings,
    }),
  })
  .superRefine((config, context) => {
    if (config.sendMode === "webhook") {
      if (!config.webhookUrl) {
        context.addIssue({
          code: "custom",
          path: ["webhookUrl"],
          message: "Feishu webhook URL is required in webhook send mode",
        });
      }

      if (config.urgent) {
        context.addIssue({
          code: "custom",
          path: ["urgent"],
          message: "Feishu urgent phone requires app send mode",
        });
      }

      return;
    }

    if (!config.app) {
      context.addIssue({
        code: "custom",
        path: ["app"],
        message: "Feishu app target is required in app send mode",
      });
    }
  });

export type FeishuConfig = z.infer<typeof FeishuConfigSchema>;

function feishuColorBindingNames(card: Record<string, unknown>): Set<string> {
  const names = new Set<string>();
  const header = jsonRecord(card.header);

  addBindingName(names, header?.template);

  if (Array.isArray(header?.text_tag_list)) {
    for (const tag of header.text_tag_list) {
      addBindingName(names, jsonRecord(tag)?.color);
    }
  }

  return names;
}

function addBindingName(names: Set<string>, value: unknown): void {
  if (typeof value !== "string") {
    return;
  }

  const match = /^\{\{\s*bindings\.([a-zA-Z][a-zA-Z0-9_-]{0,63})\s*\}\}$/.exec(value);

  if (match) {
    names.add(match[1]!);
  }
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
