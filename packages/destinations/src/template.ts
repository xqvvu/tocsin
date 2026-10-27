import { JsonObjectSchema, redactJsonText } from "@tocsin/core";
import type {
  DestinationSummary,
  DestinationTemplateContext,
  JsonObject,
  JsonValue,
  SourceSummary,
  TemplateDiagnostic as CoreTemplateDiagnostic,
} from "@tocsin/core";
import { z } from "zod";

import {
  destinationCopy,
  displaySeverity,
  displayStatus,
  formatDestinationDateTime,
  resolveDestinationPresentation,
} from "#destinations/presentation";
import { zodTemplateDiagnostics } from "#destinations/shared/template-diagnostics";
import type { DestinationSendInput } from "#destinations/types";

const RE_TEMPLATE_VARIABLE = /\{\{\s*([^{}]+?)\s*\}\}/g;
const RE_LABEL_PATH = /^event\.labels\.([a-zA-Z0-9_.-]+)$/;
const RE_BINDING_PATH = /^bindings\.([a-zA-Z][a-zA-Z0-9_-]{0,63})$/;
const RE_TEMPLATE_BINDING_NAME = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

/**
 * Limits on one template, and where each number comes from.
 *
 * The platform limits are wildly looser than these (Feishu rejects a card only
 * past 30 KB — see feishu-errors' 230025; Slack allows 3000 chars of mrkdwn).
 * These are Tocsin's own ceilings: high enough that any hand-written notification
 * fits, low enough that a runaway generator cannot post a megabyte per alert.
 * They are not derived from a provider spec, and should not be presented as if
 * they were — a template that passes here can still be rejected upstream.
 */
export const TEMPLATE_TEXT_MAX_LENGTH = 4000;
const TEMPLATE_MAX_BINDINGS = 32;
const TEMPLATE_BINDING_NAME_MAX_LENGTH = 128;
const TEMPLATE_BINDING_VALUE_MAX_LENGTH = 256;

/**
 * Optional output-encoding hook for text rendering. `escape` is applied to each
 * interpolated variable value only; the template's own literal text — an HTML
 * body's `<table>` markup, for example — is emitted untouched. That is what lets
 * a destination keep operator-written structure while hostile variable values
 * (an event title containing `<script>`) become inert entities.
 */
export interface TemplateRenderOptions {
  escape?: (value: string) => string;
}

export const TemplateBindingSelectorSchema = z.enum([
  "event.status",
  "event.severity",
  "source.provider",
  "destination.kind",
]);

export const TemplateBindingSchema = z.strictObject({
  select: TemplateBindingSelectorSchema,
  cases: z
    .record(
      z.string().min(1).max(TEMPLATE_BINDING_NAME_MAX_LENGTH),
      z.string().max(TEMPLATE_BINDING_VALUE_MAX_LENGTH),
    )
    .refine((cases) => Object.keys(cases).length > 0, {
      message: "Destination template binding cases must not be empty",
    }),
  fallback: z.string().max(TEMPLATE_BINDING_VALUE_MAX_LENGTH),
});

export const TemplateBindingsSchema = z
  .record(
    z.string().regex(RE_TEMPLATE_BINDING_NAME, {
      message: "Destination template binding name is invalid",
    }),
    TemplateBindingSchema,
  )
  .refine((bindings) => Object.keys(bindings).length <= TEMPLATE_MAX_BINDINGS, {
    message: `Destination template supports at most ${TEMPLATE_MAX_BINDINGS} bindings`,
  });

export type TemplateBindingSelector = z.infer<typeof TemplateBindingSelectorSchema>;
export type TemplateBinding = z.infer<typeof TemplateBindingSchema>;
export type TemplateBindings = z.infer<typeof TemplateBindingsSchema>;

export type TemplateStaticPath =
  | "event.id"
  | "event.title"
  | "event.message"
  | "event.severity"
  | "event.severityDisplay"
  | "event.status"
  | "event.statusDisplay"
  | "event.fingerprint"
  | "event.occurredAt"
  | "event.occurredAtDisplay"
  | "source.id"
  | "source.name"
  | "source.provider"
  | "destination.id"
  | "destination.name"
  | "destination.kind"
  | "presentation.locale"
  | "presentation.timeZone"
  | "presentation.labels.summary"
  | "presentation.labels.description"
  | "presentation.labels.status"
  | "presentation.labels.source"
  | "presentation.labels.severity"
  | "presentation.labels.provider"
  | "presentation.labels.service"
  | "presentation.labels.environment"
  | "presentation.labels.fingerprint"
  | "presentation.labels.occurredAt"
  | "presentation.labels.eventId"
  | "presentation.labels.destination"
  | "presentation.labels.labels"
  | "presentation.labels.core"
  | "presentation.labels.viewAlertRule"
  | "presentation.labels.viewRelatedLogs"
  | "presentation.labels.threshold"
  | "presentation.labels.checkResult"
  | "presentation.labels.responseTime"
  | "presentation.labels.checkType"
  | "presentation.labels.monitorId"
  | "presentation.labels.monitorPath"
  | "presentation.labels.checkUrl"
  | "presentation.labels.lastFailure"
  | "presentation.labels.fastgptModelProbe"
  | "presentation.labels.modelProviderAndType"
  | "presentation.labels.modelId"
  | "presentation.labels.modelTypeLlm"
  | "presentation.labels.modelTypeTts"
  | "presentation.labels.attempts"
  | "presentation.labels.probeError"
  | "presentation.labels.probeRecovered"
  | "presentation.labels.probeFailed"
  | "presentation.labels.probeUnknown"
  | "tocsin.eventUrl";

type TemplateStaticPathResolver = (context: TemplateContext) => string;

const TemplateStaticPathResolvers = {
  "event.id": (context) => context.event.id,
  "event.title": (context) => context.event.title,
  "event.message": (context) => context.event.message,
  "event.severity": (context) => context.event.severity,
  "event.severityDisplay": (context) => context.event.severityDisplay,
  "event.status": (context) => context.event.status,
  "event.statusDisplay": (context) => context.event.statusDisplay,
  "event.fingerprint": (context) => context.event.fingerprint,
  "event.occurredAt": (context) => context.event.occurredAt,
  "event.occurredAtDisplay": (context) => context.event.occurredAtDisplay,
  "source.id": (context) => context.source.id,
  "source.name": (context) => context.source.name,
  "source.provider": (context) => context.source.provider,
  "destination.id": (context) => context.destination.id,
  "destination.name": (context) => context.destination.name,
  "destination.kind": (context) => context.destination.kind,
  "presentation.locale": (context) => context.presentation.locale,
  "presentation.timeZone": (context) => context.presentation.timeZone,
  "presentation.labels.summary": (context) => context.presentation.labels.summary,
  "presentation.labels.description": (context) => context.presentation.labels.description,
  "presentation.labels.status": (context) => context.presentation.labels.status,
  "presentation.labels.source": (context) => context.presentation.labels.source,
  "presentation.labels.severity": (context) => context.presentation.labels.severity,
  "presentation.labels.provider": (context) => context.presentation.labels.provider,
  "presentation.labels.service": (context) => context.presentation.labels.service,
  "presentation.labels.environment": (context) => context.presentation.labels.environment,
  "presentation.labels.fingerprint": (context) => context.presentation.labels.fingerprint,
  "presentation.labels.occurredAt": (context) => context.presentation.labels.occurredAt,
  "presentation.labels.eventId": (context) => context.presentation.labels.eventId,
  "presentation.labels.destination": (context) => context.presentation.labels.destination,
  "presentation.labels.labels": (context) => context.presentation.labels.labels,
  "presentation.labels.core": (context) => context.presentation.labels.core,
  "presentation.labels.viewAlertRule": (context) => context.presentation.labels.viewAlertRule,
  "presentation.labels.viewRelatedLogs": (context) => context.presentation.labels.viewRelatedLogs,
  "presentation.labels.threshold": (context) => context.presentation.labels.threshold,
  "presentation.labels.checkResult": (context) => context.presentation.labels.checkResult,
  "presentation.labels.responseTime": (context) => context.presentation.labels.responseTime,
  "presentation.labels.checkType": (context) => context.presentation.labels.checkType,
  "presentation.labels.monitorId": (context) => context.presentation.labels.monitorId,
  "presentation.labels.monitorPath": (context) => context.presentation.labels.monitorPath,
  "presentation.labels.checkUrl": (context) => context.presentation.labels.checkUrl,
  "presentation.labels.lastFailure": (context) => context.presentation.labels.lastFailure,
  "presentation.labels.fastgptModelProbe": (context) =>
    context.presentation.labels.fastgptModelProbe,
  "presentation.labels.modelProviderAndType": (context) =>
    context.presentation.labels.modelProviderAndType,
  "presentation.labels.modelId": (context) => context.presentation.labels.modelId,
  "presentation.labels.modelTypeLlm": (context) => context.presentation.labels.modelTypeLlm,
  "presentation.labels.modelTypeTts": (context) => context.presentation.labels.modelTypeTts,
  "presentation.labels.attempts": (context) => context.presentation.labels.attempts,
  "presentation.labels.probeError": (context) => context.presentation.labels.probeError,
  "presentation.labels.probeRecovered": (context) => context.presentation.labels.probeRecovered,
  "presentation.labels.probeFailed": (context) => context.presentation.labels.probeFailed,
  "presentation.labels.probeUnknown": (context) => context.presentation.labels.probeUnknown,
  "tocsin.eventUrl": (context) => context.tocsin.eventUrl,
} satisfies Record<TemplateStaticPath, TemplateStaticPathResolver>;

const AllowedTemplatePaths: ReadonlySet<TemplateStaticPath> = new Set(
  Object.keys(TemplateStaticPathResolvers) as TemplateStaticPath[],
);

/**
 * Every static path a template may reference, in the order the resolvers
 * declare them.
 *
 * Exported so the console can offer the real list instead of maintaining its
 * own copy: it previously hard-coded 18 of these while the engine allowed 45,
 * so an operator saw a variable reference panel missing most of what actually
 * works. A hand-maintained subset of a machine-checkable set drifts.
 */
export const TemplateVariablePaths: readonly TemplateStaticPath[] = Object.freeze(
  Object.keys(TemplateStaticPathResolvers) as TemplateStaticPath[],
);

/**
 * Prefixes that resolve dynamically rather than from a fixed list, so the
 * console can show them as patterns (`event.labels.<name>`) rather than
 * enumerating values it cannot know.
 */
export const TemplateVariablePrefixes = Object.freeze(["event.labels.", "payload."] as const);

export const TextDestinationTemplateSchema = z
  .strictObject({
    source: z.literal("custom").optional(),
    mode: z.literal("text"),
    text: z.string().trim().min(1).max(TEMPLATE_TEXT_MAX_LENGTH),
    bindings: TemplateBindingsSchema.optional(),
  })
  .superRefine((template, context) => {
    for (const diagnostic of DestinationTemplateEngine.diagnoseTextTemplate(
      template.text,
      "template.text",
      template.bindings,
    )) {
      if (diagnostic.severity !== "error") {
        continue;
      }

      context.addIssue({
        code: "custom",
        path: ["text"],
        message: diagnostic.message,
      });
    }
  });

export const FeishuCardDestinationTemplateSchema = z
  .strictObject({
    source: z.literal("custom").optional(),
    mode: z.literal("feishu_card"),
    card: JsonObjectSchema,
    bindings: TemplateBindingsSchema.optional(),
  })
  .superRefine((template, context) => {
    for (const diagnostic of DestinationTemplateEngine.diagnoseJsonTemplate(
      template.card,
      "template.card",
      template.bindings,
    )) {
      if (diagnostic.severity !== "error") {
        continue;
      }

      context.addIssue({
        code: "custom",
        path: diagnostic.path?.replace(/^template\./, "").split(".") ?? ["card"],
        message: diagnostic.message,
      });
    }
  });

export const JsonPayloadDestinationTemplateSchema = z
  .strictObject({
    source: z.literal("custom").optional(),
    mode: z.literal("json_payload"),
    payload: JsonObjectSchema,
    bindings: TemplateBindingsSchema.optional(),
  })
  .superRefine((template, context) => {
    for (const diagnostic of DestinationTemplateEngine.diagnoseJsonTemplate(
      template.payload,
      "template.payload",
      template.bindings,
    )) {
      if (diagnostic.severity !== "error") {
        continue;
      }

      context.addIssue({
        code: "custom",
        path: diagnostic.path?.replace(/^template\./, "").split(".") ?? ["payload"],
        message: diagnostic.message,
      });
    }
  });

export const SlackBlocksDestinationTemplateSchema = z
  .strictObject({
    source: z.literal("custom").optional(),
    mode: z.literal("slack_blocks"),
    // Object root, not a bare array: Slack's webhook body is an object
    // ({ text?, blocks: [...] }), so the blocks array lives under a key and the
    // shared JSON schema stays object-rooted.
    payload: JsonObjectSchema,
    bindings: TemplateBindingsSchema.optional(),
  })
  .superRefine((template, context) => {
    for (const diagnostic of DestinationTemplateEngine.diagnoseJsonTemplate(
      template.payload,
      "template.payload",
      template.bindings,
    )) {
      if (diagnostic.severity !== "error") {
        continue;
      }

      context.addIssue({
        code: "custom",
        path: diagnostic.path?.replace(/^template\./, "").split(".") ?? ["payload"],
        message: diagnostic.message,
      });
    }
  });

// Union of every mode the shared engine knows how to diagnose. Each destination
// narrows this to the modes it actually renders (see feishu / slack / generic
// webhook schemas) so a destination never offers a mode it cannot render.
export const DestinationTemplateSchema = z.discriminatedUnion("mode", [
  TextDestinationTemplateSchema,
  FeishuCardDestinationTemplateSchema,
  JsonPayloadDestinationTemplateSchema,
  SlackBlocksDestinationTemplateSchema,
]);

export const TextOnlyDestinationTemplateSchema = TextDestinationTemplateSchema;

export const JsonPayloadOnlyDestinationTemplateSchema = JsonPayloadDestinationTemplateSchema;

export const SlackBlocksOnlyDestinationTemplateSchema = SlackBlocksDestinationTemplateSchema;

export type TextDestinationTemplate = z.infer<typeof TextDestinationTemplateSchema>;
export type FeishuCardDestinationTemplate = z.infer<typeof FeishuCardDestinationTemplateSchema>;
export type DestinationTemplate = z.infer<typeof DestinationTemplateSchema>;
export type DestinationTemplateMode = DestinationTemplate["mode"];

export type TemplateContext = DestinationTemplateContext;
export type TemplateDiagnostic = CoreTemplateDiagnostic;

export interface RenderTemplateResult<T extends JsonValue | string = JsonValue | string> {
  ok: boolean;
  value: T;
  diagnostics: TemplateDiagnostic[];
}

export class TemplateValidationError extends Error {
  readonly diagnostics: TemplateDiagnostic[];

  constructor(diagnostics: TemplateDiagnostic[]) {
    super(diagnostics[0]?.message ?? "Destination template is invalid");
    this.name = "TemplateValidationError";
    this.diagnostics = diagnostics;
  }
}

export class DestinationTemplateEngine {
  static createRenderContext(
    input: DestinationSendInput<unknown>,
    options: { eventUrl?: string; bindings?: TemplateBindings } = {},
  ): TemplateContext {
    const presentation = resolveDestinationPresentation(input.presentation);
    const context: TemplateContext = {
      event: {
        id: input.eventId,
        title: input.normalizedEvent.title,
        message: input.normalizedEvent.message,
        severity: input.normalizedEvent.severity,
        severityDisplay: displaySeverity(input.normalizedEvent.severity, input.presentation),
        status: input.normalizedEvent.status,
        statusDisplay: displayStatus(input.normalizedEvent.status, input.presentation),
        fingerprint: input.normalizedEvent.fingerprint,
        occurredAt: input.normalizedEvent.occurredAt,
        occurredAtDisplay: formatDestinationDateTime(
          input.normalizedEvent.occurredAt,
          input.presentation,
        ),
        labels: input.normalizedEvent.labels,
      },
      source: templateSource(input.source),
      destination: templateDestination(input.destination),
      presentation: {
        ...presentation,
        labels: destinationCopy(presentation).labels,
      },
      tocsin: {
        eventUrl: options.eventUrl ?? "",
      },
      payload: redactJsonText(input.payload ?? {}),
      bindings: {},
    };

    context.bindings = resolveTemplateBindings(
      context,
      options.bindings ?? templateBindingsFromConfig(input.config),
    );

    return context;
  }

  static diagnoseDestinationTemplate(
    template: DestinationTemplate,
    path = "template",
  ): TemplateDiagnostic[] {
    // Exhaustive switch on mode: each arm reads its own template field, so
    // diagnostic paths point at template.text / template.card / template.payload.
    // A new mode must add an arm here — TypeScript's never check enforces it.
    switch (template.mode) {
      case "text":
        return this.diagnoseTextTemplate(template.text, `${path}.text`, template.bindings);
      case "feishu_card":
        return this.diagnoseJsonTemplate(template.card, `${path}.card`, template.bindings);
      case "json_payload":
      case "slack_blocks":
        return this.diagnoseJsonTemplate(template.payload, `${path}.payload`, template.bindings);
    }
  }

  static diagnoseConfig(config: JsonObject): TemplateDiagnostic[] {
    // Dispatch on the declared mode first rather than parsing first, so an
    // unknown template variable is reported as itself.
    //
    // Parsing first silently discarded it (#53): a mode schema's superRefine
    // rejects the very variable a caller wants diagnosed, so safeParse failed
    // and the caller — the console preview — got an empty list and showed
    // nothing. A structurally invalid template still has no useful mode arm to
    // dispatch on, and for those the parse is the only signal, so it falls
    // back to the zod issues.
    const template = config.template;

    // No template is a valid configuration — there is nothing to diagnose.
    if (template === undefined) {
      return [];
    }

    if (isDestinationTemplateLike(template)) {
      return this.diagnoseDestinationTemplate(template);
    }

    // A template with no `mode` belongs to its destination, not to this
    // engine: Feishu's builtin card is selected by `source` and is validated
    // by Feishu's own schema. The shared engine has nothing to say about it,
    // and reporting a parse failure here would flag a perfectly valid
    // destination template as broken (caught by the console integration test).
    if (!isUnknownRecord(template) || typeof template.mode !== "string") {
      return [];
    }

    // It declares a shared mode, so it *should* match that mode's schema.
    // Whatever it got wrong is the operator's next fix. The zod flattener
    // models absent paths/nulls explicitly; this engine models them as absent
    // keys, so map at the boundary.
    const parsed = DestinationTemplateSchema.safeParse(template);

    if (parsed.success) {
      return [];
    }

    return zodTemplateDiagnostics(parsed.error).map((diagnostic) => ({
      severity: diagnostic.severity,
      message: diagnostic.message,
      ...(diagnostic.path === null ? {} : { path: diagnostic.path }),
      ...(diagnostic.variable === null ? {} : { variable: diagnostic.variable }),
    }));
  }

  static diagnoseTemplateValue(
    template: JsonValue | string,
    path = "template",
  ): TemplateDiagnostic[] {
    return typeof template === "string"
      ? this.diagnoseTextTemplate(template, path)
      : this.diagnoseJsonTemplate(template, path);
  }

  static diagnoseTextTemplate(
    template: string,
    path = "text",
    bindings: TemplateBindings = {},
  ): TemplateDiagnostic[] {
    return diagnosticsForTemplateEntries([{ template, path }], bindings);
  }

  static diagnoseJsonTemplate(
    template: JsonValue,
    path = "template",
    bindings: TemplateBindings = {},
  ): TemplateDiagnostic[] {
    return diagnosticsForTemplateEntries(templateStringEntries(template, path), bindings);
  }

  static renderText(
    context: TemplateContext,
    template: string,
    path = "text",
    bindings: TemplateBindings = {},
    options: TemplateRenderOptions = {},
  ): RenderTemplateResult<string> {
    const diagnostics = this.diagnoseTextTemplate(template, path, bindings);

    if (hasErrorDiagnostics(diagnostics)) {
      return {
        ok: false,
        value: "",
        diagnostics,
      };
    }

    return {
      ok: true,
      value: interpolateTemplateString(
        contextWithBindings(context, bindings),
        template,
        options.escape,
      ),
      diagnostics,
    };
  }

  static renderJson(
    context: TemplateContext,
    template: JsonValue,
    path = "template",
    bindings: TemplateBindings = {},
  ): RenderTemplateResult<JsonValue> {
    const diagnostics = this.diagnoseJsonTemplate(template, path, bindings);

    if (hasErrorDiagnostics(diagnostics)) {
      return {
        ok: false,
        value: null,
        diagnostics,
      };
    }

    return {
      ok: true,
      value: interpolateJsonTemplate(contextWithBindings(context, bindings), template),
      diagnostics,
    };
  }

  static renderTextOrThrow(
    context: TemplateContext,
    template: string,
    path = "text",
    bindings: TemplateBindings = {},
    options: TemplateRenderOptions = {},
  ): string {
    const rendered = this.renderText(context, template, path, bindings, options);

    if (!rendered.ok) {
      throw new TemplateValidationError(rendered.diagnostics);
    }

    return rendered.value;
  }

  static renderJsonOrThrow(
    context: TemplateContext,
    template: JsonValue,
    path = "template",
    bindings: TemplateBindings = {},
  ): JsonValue {
    const rendered = this.renderJson(context, template, path, bindings);

    if (!rendered.ok) {
      throw new TemplateValidationError(rendered.diagnostics);
    }

    return rendered.value;
  }

  static assertTextTemplateIsValid(
    template: string,
    path = "text",
    bindings: TemplateBindings = {},
  ): void {
    const diagnostics = this.diagnoseTextTemplate(template, path, bindings);

    if (hasErrorDiagnostics(diagnostics)) {
      throw new TemplateValidationError(diagnostics);
    }
  }

  static assertJsonTemplateIsValid(
    template: JsonValue,
    path = "template",
    bindings: TemplateBindings = {},
  ): void {
    const diagnostics = this.diagnoseJsonTemplate(template, path, bindings);

    if (hasErrorDiagnostics(diagnostics)) {
      throw new TemplateValidationError(diagnostics);
    }
  }

  static isValidationError(error: unknown): error is TemplateValidationError {
    return error instanceof TemplateValidationError;
  }

  static validationErrorToPayload(error: TemplateValidationError): JsonObject {
    return {
      templateError: {
        diagnostics: error.diagnostics.map((diagnostic) => ({
          severity: diagnostic.severity,
          path: diagnostic.path ?? null,
          variable: diagnostic.variable ?? null,
          message: diagnostic.message,
        })),
      },
    };
  }
}

interface TemplateStringEntry {
  template: string;
  path: string;
}

function templateStringEntries(value: JsonValue, path: string): TemplateStringEntry[] {
  if (typeof value === "string") {
    return [{ template: value, path }];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => templateStringEntries(item, `${path}.${index}`));
  }

  if (isJsonObject(value)) {
    return Object.entries(value).flatMap(([key, item]) =>
      templateStringEntries(item, `${path}.${key}`),
    );
  }

  return [];
}

function diagnosticsForTemplateEntries(
  entries: TemplateStringEntry[],
  bindings: TemplateBindings,
): TemplateDiagnostic[] {
  const bindingNames = new Set(Object.keys(bindings));
  const referencedBindings = new Set<string>();
  const diagnostics: TemplateDiagnostic[] = [];

  for (const entry of entries) {
    for (const match of entry.template.matchAll(RE_TEMPLATE_VARIABLE)) {
      const variable = match[1]!;
      const bindingMatch = RE_BINDING_PATH.exec(variable);

      if (bindingMatch && bindingNames.has(bindingMatch[1]!)) {
        referencedBindings.add(bindingMatch[1]!);
      }

      if (!isAllowedTemplatePath(variable, bindingNames)) {
        diagnostics.push({
          severity: "error",
          path: entry.path,
          variable,
          message: `Destination template contains unknown variable: ${variable}${suggestionFor(variable)}`,
        });
      }
    }
  }

  for (const bindingName of bindingNames) {
    if (!referencedBindings.has(bindingName)) {
      diagnostics.push({
        severity: "warning",
        path: `template.bindings.${bindingName}`,
        variable: `bindings.${bindingName}`,
        message: `Destination template binding is not referenced: ${bindingName}`,
      });
    }
  }

  return diagnostics;
}

function interpolateJsonTemplate(context: TemplateContext, value: JsonValue): JsonValue {
  if (typeof value === "string") {
    return interpolateTemplateString(context, value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => interpolateJsonTemplate(context, item));
  }

  if (isJsonObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, interpolateJsonTemplate(context, item)]),
    );
  }

  return value;
}

function interpolateTemplateString(
  context: TemplateContext,
  template: string,
  escape?: (value: string) => string,
): string {
  return template.replaceAll(RE_TEMPLATE_VARIABLE, (_match, rawPath: string) => {
    const value = templateValue(context, rawPath);

    return escape ? escape(value) : value;
  });
}

function templateValue(context: TemplateContext, path: string): string {
  if (isTemplateStaticPath(path)) {
    return TemplateStaticPathResolvers[path](context);
  }

  const labelMatch = RE_LABEL_PATH.exec(path);

  if (labelMatch) {
    return context.event.labels[labelMatch[1]!] ?? "";
  }

  const payloadSegments = payloadPathSegments(path);

  if (payloadSegments) {
    return payloadTemplateValue(context.payload, payloadSegments);
  }

  const bindingMatch = RE_BINDING_PATH.exec(path);

  if (bindingMatch) {
    return context.bindings[bindingMatch[1]!] ?? "";
  }

  return "";
}

function isAllowedTemplatePath(path: string, bindingNames: ReadonlySet<string>): boolean {
  if (
    isTemplateStaticPath(path) ||
    RE_LABEL_PATH.test(path) ||
    payloadPathSegments(path) !== null
  ) {
    return true;
  }

  const bindingMatch = RE_BINDING_PATH.exec(path);

  return Boolean(bindingMatch && bindingNames.has(bindingMatch[1]!));
}

/**
 * A "did you mean" suffix for a mistyped static path, or an empty string when
 * nothing is close enough to be worth suggesting.
 *
 * Only static paths are considered: labels, payload paths and bindings resolve
 * dynamically, so there is no fixed list to compare against — suggesting one
 * would be worse than staying quiet.
 */
function suggestionFor(variable: string): string {
  if (variable.includes("{{") || variable.trim() !== variable) {
    return "";
  }

  const nearest = nearestTemplatePath(variable);

  return nearest ? ` (did you mean ${nearest}?)` : "";
}

/** Closest static path within a small edit distance, if any. */
function nearestTemplatePath(variable: string): string | null {
  // Scaled to the identifier's length: one slip in a short name is a typo, in
  // a long one it is usually a different variable entirely.
  const limit = variable.length <= 8 ? 1 : variable.length <= 16 ? 2 : 3;
  let best: string | null = null;
  let bestDistance = limit + 1;

  for (const candidate of AllowedTemplatePaths) {
    const distance = editDistance(variable.toLowerCase(), candidate.toLowerCase());

    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return bestDistance <= limit ? best : null;
}

/** Levenshtein distance, iterative with a single rolling row. */
function editDistance(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];

    for (let j = 1; j <= right.length; j += 1) {
      const substitution = previous[j - 1]! + (left[i - 1] === right[j - 1] ? 0 : 1);

      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, substitution);
    }

    previous = current;
  }

  return previous[right.length]!;
}

function payloadTemplateValue(payload: JsonValue, segments: string[]): string {
  let value: JsonValue | undefined = payload;

  for (const segment of segments) {
    if (Array.isArray(value)) {
      if (!/^\d+$/.test(segment)) {
        return "";
      }

      value = value[Number(segment)];
      continue;
    }

    if (!isJsonObject(value) || !Object.hasOwn(value, segment)) {
      return "";
    }

    value = value[segment];
  }

  if (typeof value === "string") {
    return value;
  }

  return typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

function payloadPathSegments(path: string): string[] | null {
  if (!path.startsWith("payload")) {
    return null;
  }

  const segments: string[] = [];
  let remainder = path.slice("payload".length);

  while (remainder.length > 0) {
    const propertyMatch = /^\.([a-zA-Z0-9_-]+)/.exec(remainder);

    if (propertyMatch) {
      segments.push(propertyMatch[1]!);
      remainder = remainder.slice(propertyMatch[0].length);
      continue;
    }

    const indexMatch = /^\[(\d+)\]/.exec(remainder);

    if (indexMatch) {
      segments.push(indexMatch[1]!);
      remainder = remainder.slice(indexMatch[0].length);
      continue;
    }

    const quotedKeyMatch = /^\[("(?:[^"\\]|\\.)*")\]/.exec(remainder);

    if (quotedKeyMatch) {
      try {
        const key = JSON.parse(quotedKeyMatch[1]!) as unknown;

        if (typeof key !== "string") {
          return null;
        }

        segments.push(key);
        remainder = remainder.slice(quotedKeyMatch[0].length);
        continue;
      } catch {
        return null;
      }
    }

    return null;
  }

  return segments.length > 0 ? segments : null;
}

function resolveTemplateBindings(
  context: TemplateContext,
  bindings: TemplateBindings,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(bindings).map(([name, binding]) => {
      const selectorValue = templateBindingSelectorValue(context, binding.select);
      const value = Object.hasOwn(binding.cases, selectorValue)
        ? binding.cases[selectorValue]!
        : binding.fallback;

      return [name, value];
    }),
  );
}

function contextWithBindings(
  context: TemplateContext,
  bindings: TemplateBindings,
): TemplateContext {
  return {
    ...context,
    bindings: resolveTemplateBindings(context, bindings),
  };
}

function templateBindingSelectorValue(
  context: TemplateContext,
  selector: TemplateBindingSelector,
): string {
  switch (selector) {
    case "event.status":
      return context.event.status;
    case "event.severity":
      return context.event.severity;
    case "source.provider":
      return context.source.provider;
    case "destination.kind":
      return context.destination.kind;
  }
}

function templateBindingsFromConfig(config: unknown): TemplateBindings {
  if (!isUnknownRecord(config)) {
    return {};
  }

  const template = config.template;

  if (!isUnknownRecord(template)) {
    return {};
  }

  const parsed = TemplateBindingsSchema.safeParse(template.bindings);

  return parsed.success ? parsed.data : {};
}

function hasErrorDiagnostics(diagnostics: TemplateDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTemplateStaticPath(path: string): path is TemplateStaticPath {
  return AllowedTemplatePaths.has(path as TemplateStaticPath);
}

/**
 * True when a config's `template` value carries a recognised mode and the body
 * field that mode reads, so it can be dispatched without schema validation.
 * Deliberately structural: dispatch must work on templates whose *contents*
 * are invalid, because diagnosing those contents is the point (#53).
 */
function isDestinationTemplateLike(value: unknown): value is DestinationTemplate {
  if (!isUnknownRecord(value)) {
    return false;
  }

  const { mode } = value;

  if (mode === "text") {
    return typeof value.text === "string";
  }

  if (mode === "feishu_card") {
    return isJsonObject(value.card);
  }

  if (mode === "json_payload" || mode === "slack_blocks") {
    return isJsonObject(value.payload);
  }

  return false;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function templateSource(source: SourceSummary): TemplateContext["source"] {
  return {
    id: source.id,
    name: source.name,
    provider: source.provider,
  };
}

function templateDestination(destination: DestinationSummary): TemplateContext["destination"] {
  return {
    id: destination.id,
    name: destination.name,
    kind: destination.kind,
  };
}
