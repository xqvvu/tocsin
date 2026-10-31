import {
  AlertSeveritySchema,
  formHeaderLines,
  formSeparatedList,
  formString,
  formTrimmedString,
  JsonObjectSchema,
  nonEmptyObject,
  type AdapterConfigHelp,
  type AdapterTemplateConfigField,
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

import type { DestinationCatalog } from "#/features/destinations/model/destination-types";

export type DestinationFormKind = "generic_webhook" | "feishu" | "slack" | "email";
/**
 * Every template mode the console knows how to edit. Which of them a
 * destination offers is decided by that destination's manifest `modes`, never
 * by a branch on kind, so declaring a mode in a manifest is enough to make it
 * selectable in the form (see `destinationTemplateModes`).
 */
export type DestinationTemplateFormMode = "text" | "feishu_card" | "json_payload" | "slack_blocks";
export type DestinationTemplateFormSource = "builtin" | "custom";

/** Where one template mode keeps its body, both in form state and in config. */
interface DestinationTemplateBodyField {
  /** Form state field the operator edits for this mode. */
  formField: "templateText" | "templateCard" | "templatePayload";
  /** Key the saved `template` object stores that body under. */
  templateKey: "text" | "card" | "payload";
  /** JSON modes edit an object body, text modes a plain string. */
  json: boolean;
  labelKey: string;
  descriptionKey: string;
  /**
   * Hint under the mode control while this mode is selected, used when the
   * manifest's mode entry declares no `descriptionKey` of its own.
   */
  modeDescriptionKey: string;
  /** Body seeded when the editor is opened on an empty mode. */
  starter: string;
}

/**
 * Mode → body mapping. It mirrors the shared template engine schemas
 * (`feishu_card` → `card`, `json_payload` and `slack_blocks` → `payload`), so
 * it is a property of the mode and identical for every destination: one JSON
 * editor serves all three JSON modes.
 */
const DESTINATION_TEMPLATE_BODY_FIELDS: Record<
  DestinationTemplateFormMode,
  DestinationTemplateBodyField
> = {
  text: {
    formField: "templateText",
    templateKey: "text",
    json: false,
    labelKey: "destinations.form.template",
    descriptionKey: "destinations.form.templateDescription",
    modeDescriptionKey: "destinations.form.templateModeTextDescription",
    starter: "",
  },
  feishu_card: {
    formField: "templateCard",
    templateKey: "card",
    json: true,
    labelKey: "destinations.form.feishuCardTemplate",
    descriptionKey: "destinations.form.feishuCardTemplateDescription",
    modeDescriptionKey: "destinations.form.templateModeFeishuCardDescription",
    starter: JSON.stringify(defaultFeishuCardTemplate, null, 2),
  },
  json_payload: {
    formField: "templatePayload",
    templateKey: "payload",
    json: true,
    labelKey: "destinations.form.jsonPayloadTemplate",
    descriptionKey: "destinations.form.jsonPayloadTemplateDescription",
    modeDescriptionKey: "destinations.form.templateModeJsonPayloadDescription",
    starter: JSON.stringify(
      {
        event: "{{event.title}}",
        severity: "{{event.severity}}",
        message: "{{event.message}}",
      },
      null,
      2,
    ),
  },
  slack_blocks: {
    formField: "templatePayload",
    templateKey: "payload",
    json: true,
    labelKey: "destinations.form.slackBlocksTemplate",
    descriptionKey: "destinations.form.slackBlocksTemplateDescription",
    modeDescriptionKey: "destinations.form.templateModeSlackBlocksDescription",
    starter: JSON.stringify(
      {
        text: "[{{event.severity}}] {{event.title}}",
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: "*{{event.status}}*: {{event.message}}" },
          },
        ],
      },
      null,
      2,
    ),
  },
};

/** One selectable entry of the template mode control, resolved from a manifest. */
export interface DestinationTemplateModeOption {
  mode: DestinationTemplateFormMode;
  labelKey: string;
  descriptionKey?: string;
}

export interface DestinationTemplateFormState {
  templateSource: DestinationTemplateFormSource;
  templateMode: DestinationTemplateFormMode;
  templateText: string;
  templateCard: string;
  /** JSON body edited by the `json_payload` and `slack_blocks` modes. */
  templatePayload: string;
  templateBindings: string;
  templateColorEnabled: boolean;
  templateColorSelector: TemplateBindingSelector;
  templateColorCases: Record<string, string>;
  templateColorFallback: string;
  templatePreviewStatus: "firing" | "resolved" | "unknown";
}

export function isDestinationTemplateFormMode(
  value: unknown,
): value is DestinationTemplateFormMode {
  return typeof value === "string" && Object.hasOwn(DESTINATION_TEMPLATE_BODY_FIELDS, value);
}

/** True when the mode edits a JSON object body rather than a text string. */
export function isDestinationTemplateJsonMode(mode: DestinationTemplateFormMode): boolean {
  return DESTINATION_TEMPLATE_BODY_FIELDS[mode].json;
}

/** Form state field that holds the drafted body for one mode. */
export function destinationTemplateBodyFormField(
  mode: DestinationTemplateFormMode,
): DestinationTemplateBodyField["formField"] {
  return DESTINATION_TEMPLATE_BODY_FIELDS[mode].formField;
}

/** Editor copy (label / description keys) for one mode's body. */
export function destinationTemplateBodyCopy(mode: DestinationTemplateFormMode): {
  labelKey: string;
  descriptionKey: string;
} {
  const field = DESTINATION_TEMPLATE_BODY_FIELDS[mode];

  return { labelKey: field.labelKey, descriptionKey: field.descriptionKey };
}

/**
 * Starter body seeded when an operator switches to a JSON mode with an empty
 * editor. Each JSON mode owns a valid document of its own shape, so the first
 * save can never post an empty or half-written object.
 */
export function destinationTemplateBodyStarter(mode: DestinationTemplateFormMode): string {
  return DESTINATION_TEMPLATE_BODY_FIELDS[mode].starter;
}

/** 1-based position of a JSON syntax error inside the drafted body text. */
export interface DestinationTemplateBodyDraftLocation {
  line: number;
  column: number;
}

/**
 * Result of checking drafted JSON body text, so the editor can say *what* is
 * wrong instead of one generic sentence:
 *
 * - `valid`: empty (no template) or a JSON object, ready to save.
 * - `not-object`: parseable JSON whose root is not an object, which every JSON
 *   mode's schema requires.
 * - `syntax`: `JSON.parse` rejected the text; `location` is the 1-based
 *   line/column where the parser stopped, or null on engines that report no
 *   position at all.
 *
 * Checked at the form boundary so a half-written document reports a field
 * error instead of throwing out of submit, and rendered live so the operator
 * sees it while typing.
 */
export type DestinationTemplateBodyDraftCheck =
  | { valid: true }
  | { valid: false; reason: "not-object" }
  | { valid: false; reason: "syntax"; location: DestinationTemplateBodyDraftLocation | null };

export function isDestinationTemplateBodyDraft(value: string): DestinationTemplateBodyDraftCheck {
  if (!value.trim()) {
    return { valid: true };
  }

  let parsed: unknown;

  try {
    // Parsed untrimmed so a reported position indexes the text the operator
    // sees, including any leading blank lines.
    parsed = JSON.parse(value) as unknown;
  } catch (error) {
    return { valid: false, reason: "syntax", location: syntaxErrorLocation(value, error) };
  }

  return JsonObjectSchema.safeParse(parsed).success
    ? { valid: true }
    : { valid: false, reason: "not-object" };
}

/**
 * Where `JSON.parse` stopped. V8 no longer exposes `SyntaxError.position`
 * (checked on the pinned Node), but it names the offset in the message
 * (`... in JSON at position 12 (line 3 column 1)`); older V8/Chrome and
 * Firefox-style engines report either the raw position or a line/column. When
 * nothing is reported the check still reports a syntax error, just without a
 * location.
 */
function syntaxErrorLocation(
  source: string,
  error: unknown,
): DestinationTemplateBodyDraftLocation | null {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? (error as { message?: unknown }).message
      : undefined;

  if (typeof message === "string") {
    // V8: `... in JSON at position 12 (line 3 column 1)` — the offset is
    // relative to the parsed text, so count the lines ourselves.
    const position = /at position (\d+)/.exec(message);

    if (position) {
      return locationFromPosition(source, Number(position[1]));
    }

    // Firefox: `JSON.parse: unexpected character at line 3 column 1`.
    const reported = /line (\d+) column (\d+)/.exec(message);

    if (reported) {
      return { line: Number(reported[1]), column: Number(reported[2]) };
    }
  }

  if (typeof error === "object" && error !== null) {
    const { position } = error as { position?: unknown };

    if (typeof position === "number" && Number.isInteger(position) && position >= 0) {
      return locationFromPosition(source, position);
    }
  }

  return null;
}

function locationFromPosition(
  source: string,
  position: number,
): DestinationTemplateBodyDraftLocation {
  const before = source.slice(0, Math.min(position, source.length));
  const lines = before.split("\n");

  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

function isTemplateConfigField(
  field: DestinationCatalog[number]["configFields"][number],
): field is AdapterTemplateConfigField {
  return field.type === "template";
}

function templateConfigField(
  catalog: DestinationCatalog,
  kind: DestinationFormKind,
): AdapterTemplateConfigField | undefined {
  return catalog.find((item) => item.kind === kind)?.configFields.find(isTemplateConfigField);
}

/**
 * Template modes offered for one destination kind, read from that kind's
 * manifest `template` field. A manifest that declares no modes (email today)
 * still gets the universal `text` mode, and a mode the console cannot edit is
 * dropped instead of rendering a control that could never save.
 */
export function destinationTemplateModes(
  catalog: DestinationCatalog,
  kind: DestinationFormKind,
): DestinationTemplateModeOption[] {
  const field = templateConfigField(catalog, kind);
  const modes = field?.modes?.length
    ? field.modes
    : ([{ mode: "text", labelKey: undefined }] as const);

  return modes.flatMap((mode): DestinationTemplateModeOption[] => {
    if (!isDestinationTemplateFormMode(mode.mode)) {
      return [];
    }

    const body = DESTINATION_TEMPLATE_BODY_FIELDS[mode.mode];

    // The manifest's optional copy wins; not every mode declares it.
    const manifestDescriptionKey = "descriptionKey" in mode ? mode.descriptionKey : undefined;

    return [
      {
        mode: mode.mode,
        labelKey: mode.labelKey ?? body.labelKey,
        ...(manifestDescriptionKey ? { descriptionKey: manifestDescriptionKey } : {}),
      },
    ];
  });
}

/**
 * Hint shown under the mode control for the selected mode: the manifest's own
 * `descriptionKey` wins, then the mode's generic console copy.
 */
export function destinationTemplateModeDescriptionKey(
  options: readonly DestinationTemplateModeOption[],
  mode: DestinationTemplateFormMode,
): string {
  return (
    options.find((option) => option.mode === mode)?.descriptionKey ??
    DESTINATION_TEMPLATE_BODY_FIELDS[mode].modeDescriptionKey
  );
}

/**
 * Clamp a drafted mode to the set the destination actually offers, so a stale
 * value (after switching kind, or an older draft) can never be submitted as a
 * template the adapter would reject.
 */
export function resolveDestinationTemplateFormMode(
  mode: unknown,
  options: readonly DestinationTemplateModeOption[],
): DestinationTemplateFormMode {
  const allowed = options.map((option) => option.mode);
  const resolved = isDestinationTemplateFormMode(mode) ? mode : undefined;

  if (resolved && allowed.includes(resolved)) {
    return resolved;
  }

  return allowed[0] ?? "text";
}

/**
 * Configuration help for the body editor of one mode: the mode's own help wins,
 * then the template field's help, both straight from the manifest.
 */
export function destinationTemplateModeHelp(
  catalog: DestinationCatalog,
  kind: DestinationFormKind,
  mode: DestinationTemplateFormMode,
): AdapterConfigHelp | null {
  const field = templateConfigField(catalog, kind);
  const modeHelp = field?.modes?.find((definition) => definition.mode === mode)?.help;

  if (modeHelp) {
    return visibleConfigHelp(modeHelp);
  }

  return visibleConfigHelp(field?.help);
}

function visibleConfigHelp(help: AdapterConfigHelp | undefined): AdapterConfigHelp | null {
  return help && help.show !== false ? help : null;
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
      // Email template slots that sit next to `template` rather than being a
      // template mode: the subject owns the whole header line, the HTML body
      // replaces the generated <pre> block.
      ...nonEmptyObject({ subjectTemplate: formTrimmedString(data, "subjectTemplate") }),
      ...nonEmptyObject({ htmlTemplate: formTrimmedString(data, "htmlTemplate") }),
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
    // `webhookUrl`, not `url`: that is the input the form actually renders for
    // every webhook-style destination. `url` exists only in the form's default
    // values, so reading it always produced an empty address and the save failed
    // with "url: Invalid URL". Same defect as in `destinationConfigPatchFromForm`.
    url: formTrimmedString(data, "webhookUrl"),
    method: formWebhookMethod(data),
    idempotencyKey: formString(data, "idempotencyKey") === "true",
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
    const subjectTemplate = formTrimmedString(data, "subjectTemplate");
    const htmlTemplate = formTrimmedString(data, "htmlTemplate");
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

    if (subjectTemplate) {
      config.subjectTemplate = subjectTemplate;
    }

    if (htmlTemplate) {
      config.htmlTemplate = htmlTemplate;
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
    // The form renders this input as `webhookUrl` — the same field name slack
    // and feishu use for a webhook address — while the generic-webhook manifest
    // names its config key `url`. Reading `url` from the form found an input
    // that is never rendered, so `config.url` was always empty and every
    // generic-webhook destination failed to save with "url: Invalid URL".
    const url = formTrimmedString(data, "webhookUrl");
    const method = formString(data, "method").toUpperCase();
    const headers = formHeaderLines(data);

    if (url) {
      config.url = url;
    }

    if (method === "POST" || method === "PUT" || method === "PATCH") {
      config.method = method;
    }

    // Patch semantics: the edit form always renders the toggle, so writing the
    // explicit boolean is what lets an operator turn the opt-in back off. Other
    // fields use truthiness because an empty input there means "keep stored".
    config.idempotencyKey = formString(data, "idempotencyKey") === "true";

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

/**
 * Build the saved `template` object from the drafted mode and that mode's body
 * field. The mode decides which field is read, so a body drafted for another
 * mode is never mixed into the result — it stays in form state so switching
 * back restores it.
 *
 * Which modes a destination exposes is the manifest's decision; the adapter's
 * config schema is what rejects a mode the kind cannot render, so this stays
 * kind-agnostic apart from Feishu's built-in card reference.
 */
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

  const mode = templateModeFromForm(data);
  const body = DESTINATION_TEMPLATE_BODY_FIELDS[mode];
  const draft = formTrimmedString(data, body.formField);

  if (!draft) {
    return null;
  }

  return {
    ...(kind === "feishu" ? { source: "custom" } : {}),
    mode,
    [body.templateKey]: body.json ? JsonObjectSchema.parse(JSON.parse(draft)) : draft,
    ...nonEmptyObject({ bindings }),
  };
}

function templateBindingsFromForm(data: FormData): JsonObject {
  const value = formTrimmedString(data, "templateBindings");

  return value ? JsonObjectSchema.parse(JSON.parse(value)) : {};
}

function templateModeFromForm(data: FormData): DestinationTemplateFormMode {
  const mode = formString(data, "templateMode");

  return isDestinationTemplateFormMode(mode) ? mode : "text";
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
    templatePayload: "",
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
  const payload = JsonObjectSchema.safeParse(template.payload);
  const isBuiltIn = template.source === "builtin";

  return {
    ...defaults,
    templateSource: isBuiltIn ? "builtin" : "custom",
    templateMode: destinationTemplateFormModeFromDraft(template, isBuiltIn),
    templateText: typeof template.text === "string" ? template.text : "",
    templateCard: card.success
      ? JSON.stringify(card.data, null, 2)
      : JSON.stringify(defaultFeishuCardTemplate, null, 2),
    templatePayload: payload.success
      ? JSON.stringify(payload.data, null, 2)
      : defaults.templatePayload,
    templateBindings: JSON.stringify(bindings),
    templateColorEnabled: Boolean(statusColor),
    templateColorSelector: statusColor?.select ?? defaults.templateColorSelector,
    templateColorCases: statusColor ? { ...statusColor.cases } : defaults.templateColorCases,
    templateColorFallback: statusColor?.fallback ?? defaults.templateColorFallback,
  };
}

/**
 * Mode for a saved template. Feishu's built-in reference is a card source
 * rather than a mode, so it maps to the card editor; anything else is read off
 * `template.mode` and falls back to text when it names a mode the console does
 * not edit.
 */
function destinationTemplateFormModeFromDraft(
  template: JsonObject,
  isBuiltIn: boolean,
): DestinationTemplateFormMode {
  if (isBuiltIn) {
    return "feishu_card";
  }

  return isDestinationTemplateFormMode(template.mode) ? template.mode : "text";
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
