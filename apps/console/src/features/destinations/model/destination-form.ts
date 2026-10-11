import {
  AlertSeveritySchema,
  formHeaderLines,
  formSeparatedList,
  formString,
  formTrimmedString,
  JsonObjectSchema,
  nonEmptyObject,
  type JsonObject,
} from "@tocsin/core";
import {
  TemplateBindingsSchema,
  type TemplateBindingSelector,
  type TemplateBindings,
} from "@tocsin/destinations";
import { defaultFeishuCardBindings } from "@tocsin/destinations/feishu/appearance";
import {
  BUILT_IN_FEISHU_ALERT_CARD_ID,
  BUILT_IN_FEISHU_ALERT_CARD_VERSION,
  defaultFeishuCardTemplate,
} from "@tocsin/destinations/feishu/default-card";

export type DestinationFormKind = "generic_webhook" | "feishu" | "slack" | "email";
export type DestinationTemplateFormMode = "text" | "feishu_card";
export type DestinationTemplateFormSource = "builtin" | "custom";

export interface DestinationTemplateFormState {
  templateSource: DestinationTemplateFormSource;
  templateMode: DestinationTemplateFormMode;
  templateText: string;
  templateCard: string;
  templateBindings: string;
  templateColorEnabled: boolean;
  templateColorSelector: TemplateBindingSelector;
  templateColorCases: Record<string, string>;
  templateColorFallback: string;
  templatePreviewStatus: "firing" | "resolved" | "unknown";
}

export function formDestinationKind(data: FormData): DestinationFormKind {
  return formDestinationKindValue(data.get("kind"));
}

export function formDestinationKindValue(
  value: FormDataEntryValue | string | null,
): DestinationFormKind {
  switch (value) {
    case "feishu":
    case "slack":
    case "email": {
      return value;
    }
    default: {
      return "generic_webhook";
    }
  }
}

export function destinationConfigFromForm(kind: DestinationFormKind, data: FormData): JsonObject {
  const template = templateFromForm(kind, data);

  if (kind === "email") {
    const subjectPrefix = formTrimmedString(data, "subjectPrefix");
    const replyTo = formTrimmedString(data, "replyTo");
    const headers = formHeaderLines(data);

    return {
      endpointUrl: formTrimmedString(data, "endpointUrl"),
      to: formSeparatedList(data, "to"),
      from: formTrimmedString(data, "from"),
      ...(replyTo ? { replyTo } : {}),
      ...(subjectPrefix ? { subjectPrefix } : {}),
      ...nonEmptyObject({ headers }),
      ...nonEmptyObject({ template }),
    };
  }

  if (kind === "feishu") {
    const sendMode = formFeishuSendMode(data);
    const webhookUrl = formTrimmedString(data, "webhookUrl");
    const signSecret = formTrimmedString(data, "signSecret");
    const appRef = formTrimmedString(data, "appRef");
    const chatId = formTrimmedString(data, "chatId");
    const urgent = urgentFromForm(data);

    return {
      sendMode,
      ...(webhookUrl ? { webhookUrl } : {}),
      ...(signSecret ? { signSecret } : {}),
      ...(sendMode === "app" && appRef && chatId ? { app: { appRef, chatId } } : {}),
      ...(sendMode === "app" && urgent ? { urgent } : {}),
      ...nonEmptyObject({ template }),
    };
  }

  if (kind === "slack") {
    return {
      webhookUrl: formTrimmedString(data, "webhookUrl"),
      ...nonEmptyObject({ template }),
    };
  }

  const headers = formHeaderLines(data);

  return {
    url: formTrimmedString(data, "url"),
    method: formWebhookMethod(data),
    ...nonEmptyObject({ headers }),
    ...nonEmptyObject({ template }),
  };
}

export function destinationConfigPatchFromForm(
  kind: DestinationFormKind,
  data: FormData,
): JsonObject {
  const template = templateFromForm(kind, data);
  const config: JsonObject = {};

  if (kind === "email") {
    const endpointUrl = formTrimmedString(data, "endpointUrl");
    const to = formSeparatedList(data, "to");
    const from = formTrimmedString(data, "from");
    const replyTo = formTrimmedString(data, "replyTo");
    const subjectPrefix = formTrimmedString(data, "subjectPrefix");
    const headers = formHeaderLines(data);

    if (endpointUrl) {
      config.endpointUrl = endpointUrl;
    }

    if (to.length > 0) {
      config.to = to;
    }

    if (from) {
      config.from = from;
    }

    if (replyTo) {
      config.replyTo = replyTo;
    }

    if (subjectPrefix) {
      config.subjectPrefix = subjectPrefix;
    }

    if (nonEmptyObject(headers)) {
      config.headers = headers;
    }
  } else if (kind === "feishu") {
    const sendMode = formFeishuSendMode(data);
    const webhookUrl = formTrimmedString(data, "webhookUrl");
    const signSecret = formTrimmedString(data, "signSecret");
    const appRef = formTrimmedString(data, "appRef");
    const chatId = formTrimmedString(data, "chatId");
    const urgent = urgentFromForm(data);

    config.sendMode = sendMode;

    if (webhookUrl) {
      config.webhookUrl = webhookUrl;
    }

    if (signSecret) {
      config.signSecret = signSecret;
    }

    if (sendMode === "app" && appRef && chatId) {
      config.app = { appRef, chatId };
    }

    if (sendMode === "app" && urgent) {
      config.urgent = urgent;
    }
  } else if (kind === "slack") {
    const webhookUrl = formTrimmedString(data, "webhookUrl");

    if (webhookUrl) {
      config.webhookUrl = webhookUrl;
    }
  } else {
    const url = formTrimmedString(data, "url");
    const method = formString(data, "method").toUpperCase();
    const headers = formHeaderLines(data);

    if (url) {
      config.url = url;
    }

    if (method === "POST" || method === "PUT" || method === "PATCH") {
      config.method = method;
    }

    if (nonEmptyObject(headers)) {
      config.headers = headers;
    }
  }

  if (template) {
    config.template = template;
  }

  return config;
}

function formFeishuSendMode(data: FormData): "webhook" | "app" {
  return formString(data, "sendMode") === "app" ? "app" : "webhook";
}

/**
 * Urgent paging block from the form.
 *
 * Receivers are the switch: an empty list means paging is not configured and
 * the block is omitted entirely. Severities default to `critical` when none are
 * selected, so an accidental empty selection cannot silently widen paging to
 * every alert.
 */
function urgentFromForm(data: FormData): JsonObject | null {
  const receivers = Array.from(new Set(formSeparatedList(data, "urgentReceivers")));

  if (receivers.length === 0) {
    return null;
  }

  const severities = formJsonStringArray(data, "urgentSeverities").flatMap((severity) => {
    const parsed = AlertSeveritySchema.safeParse(severity);

    return parsed.success ? [parsed.data] : [];
  });
  const userIdType = formString(data, "urgentUserIdType");

  return {
    autoEnabled: formString(data, "urgentAutoEnabled") === "true",
    severities: severities.length > 0 ? severities : ["critical"],
    userIdType: userIdType === "user_id" || userIdType === "union_id" ? userIdType : "open_id",
    receivers,
  };
}

function formJsonStringArray(data: FormData, key: string): string[] {
  const raw = formTrimmedString(data, key);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function templateFromForm(kind: DestinationFormKind, data: FormData): JsonObject | null {
  const bindings = templateBindingsFromForm(data);

  if (kind === "feishu" && templateSourceFromForm(data) === "builtin") {
    return {
      source: "builtin",
      id: BUILT_IN_FEISHU_ALERT_CARD_ID,
      version: BUILT_IN_FEISHU_ALERT_CARD_VERSION,
      ...nonEmptyObject({ bindings }),
    };
  }

  if (kind === "feishu" && templateModeFromForm(data) === "feishu_card") {
    const card = formTrimmedString(data, "templateCard");

    return card
      ? {
          source: "custom",
          mode: "feishu_card",
          card: JsonObjectSchema.parse(JSON.parse(card)),
          ...nonEmptyObject({ bindings }),
        }
      : null;
  }

  const text = formTrimmedString(data, "templateText");

  return text
    ? {
        ...(kind === "feishu" ? { source: "custom" } : {}),
        mode: "text",
        text,
        ...nonEmptyObject({ bindings }),
      }
    : null;
}

function templateBindingsFromForm(data: FormData): JsonObject {
  const value = formTrimmedString(data, "templateBindings");

  return value ? JsonObjectSchema.parse(JSON.parse(value)) : {};
}

function templateModeFromForm(data: FormData): DestinationTemplateFormMode {
  return formString(data, "templateMode") === "feishu_card" ? "feishu_card" : "text";
}

function templateSourceFromForm(data: FormData): DestinationTemplateFormSource {
  return formString(data, "templateSource") === "builtin" ? "builtin" : "custom";
}

function formWebhookMethod(data: FormData): "POST" | "PUT" | "PATCH" {
  const method = formString(data, "method").toUpperCase();

  return method === "PUT" || method === "PATCH" ? method : "POST";
}

export function createDefaultDestinationTemplateFormState(): DestinationTemplateFormState {
  const statusColor = defaultFeishuCardBindings.statusColor;

  return {
    templateSource: "builtin",
    templateMode: "feishu_card",
    templateText: "",
    templateCard: JSON.stringify(defaultFeishuCardTemplate, null, 2),
    templateBindings: "{}",
    templateColorEnabled: true,
    templateColorSelector: statusColor.select,
    templateColorCases: { ...statusColor.cases },
    templateColorFallback: statusColor.fallback,
    templatePreviewStatus: "firing",
  };
}

export function destinationTemplateFormStateFromDraft(
  template: JsonObject | null,
): DestinationTemplateFormState {
  const defaults = createDefaultDestinationTemplateFormState();

  if (!template) {
    return defaults;
  }

  const parsedBindings = TemplateBindingsSchema.safeParse(template.bindings);
  const bindings = parsedBindings.success ? parsedBindings.data : {};
  const statusColor = bindings.statusColor;
  const card = JsonObjectSchema.safeParse(template.card);
  const isBuiltIn = template.source === "builtin";

  return {
    ...defaults,
    templateSource: isBuiltIn ? "builtin" : "custom",
    templateMode: isBuiltIn || template.mode === "feishu_card" ? "feishu_card" : "text",
    templateText: typeof template.text === "string" ? template.text : "",
    templateCard: card.success
      ? JSON.stringify(card.data, null, 2)
      : JSON.stringify(defaultFeishuCardTemplate, null, 2),
    templateBindings: JSON.stringify(bindings),
    templateColorEnabled: Boolean(statusColor),
    templateColorSelector: statusColor?.select ?? defaults.templateColorSelector,
    templateColorCases: statusColor ? { ...statusColor.cases } : defaults.templateColorCases,
    templateColorFallback: statusColor?.fallback ?? defaults.templateColorFallback,
  };
}

export function templateBindingsJsonFromFormState(
  state: Pick<
    DestinationTemplateFormState,
    | "templateBindings"
    | "templateColorEnabled"
    | "templateColorSelector"
    | "templateColorCases"
    | "templateColorFallback"
  >,
): string {
  const parsed = TemplateBindingsSchema.safeParse(parseJson(state.templateBindings));
  const bindings: TemplateBindings = parsed.success ? { ...parsed.data } : {};

  if (state.templateColorEnabled) {
    bindings.statusColor = {
      select: state.templateColorSelector,
      cases: { ...state.templateColorCases },
      fallback: state.templateColorFallback,
    };
  } else {
    delete bindings.statusColor;
  }

  return JSON.stringify(bindings);
}

export function canApplyDynamicStatusColor(cardText: string): boolean {
  const card = parseJsonObject(cardText);
  const header = card ? jsonRecord(card.header) : null;

  return Boolean(header && header.template !== "{{bindings.statusColor}}");
}

export function applyDynamicStatusColor(cardText: string): string {
  const card = parseJsonObject(cardText);

  if (!card) {
    return cardText;
  }

  const header = jsonRecord(card.header);

  if (!header) {
    return cardText;
  }

  header.template = "{{bindings.statusColor}}";

  if (Array.isArray(header.text_tag_list)) {
    for (const item of header.text_tag_list) {
      const tag = jsonRecord(item);
      const text = jsonRecord(tag?.text);

      if (tag && text?.content === "{{event.status}}") {
        tag.color = "{{bindings.statusColor}}";
      }
    }
  }

  return JSON.stringify(card, null, 2);
}

function parseJsonObject(value: string): JsonObject | null {
  const parsed = JsonObjectSchema.safeParse(parseJson(value));

  return parsed.success ? parsed.data : null;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
