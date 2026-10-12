import { DestinationKindSchema, type AdapterConfigHelp, type DestinationKind } from "@tocsin/core";
import type { z } from "zod";

import { emailAdapter } from "#destinations/email/index";
import { feishuAdapter } from "#destinations/feishu/index";
import { genericWebhookAdapter } from "#destinations/generic-webhook/index";
import { slackAdapter } from "#destinations/slack/index";
import type {
  DestinationAdapter,
  DestinationCatalogItem,
  DestinationManifest,
  DestinationSendContext,
  DestinationSendInput,
  DestinationSendResult,
} from "#destinations/types";
import { DestinationCatalogItemSchema, DestinationManifestSchema } from "#destinations/types";

export interface DestinationRegistryAuditOptions {
  messageKeys?: ReadonlySet<string>;
}

export interface DestinationRegistryAuditResult {
  warnings: string[];
}

/** How deep a zod wrapper (optional/nullable/…) chain the audit walks before giving up. */
const MaxConfigSchemaUnwrapDepth = 5;

export class DestinationRegistry {
  private readonly adapters = new Map<DestinationKind, DestinationAdapter>();

  register(adapter: DestinationAdapter): void {
    const manifest = DestinationManifestSchema.parse(adapter.manifest);

    if (this.adapters.has(manifest.kind)) {
      throw new Error(`Destination adapter already registered: ${manifest.kind}`);
    }

    this.adapters.set(manifest.kind, adapter);
  }

  get(kind: DestinationKind): DestinationAdapter {
    const adapter = this.adapters.get(kind);

    if (!adapter) {
      throw new Error(`Unknown destination adapter: ${kind}`);
    }

    return adapter;
  }

  parse(kind: DestinationKind, config: unknown): unknown {
    return this.get(kind).configSchema.parse(config);
  }

  send(
    kind: DestinationKind,
    input: DestinationSendInput<unknown>,
    context?: DestinationSendContext,
  ): Promise<DestinationSendResult> {
    return this.get(kind).send(input, context);
  }

  preview(kind: DestinationKind, input: DestinationSendInput<unknown>) {
    return this.get(kind).preview(input);
  }

  toCatalog(): DestinationCatalogItem[] {
    return this.list.map((adapter) =>
      DestinationCatalogItemSchema.parse({
        kind: adapter.manifest.kind,
        configVersion: adapter.manifest.configVersion,
        lifecycle: adapter.manifest.lifecycle,
        displayNameKey: adapter.manifest.displayNameKey,
        descriptionKey: adapter.manifest.descriptionKey,
        iconName: adapter.manifest.iconName,
        configFields: adapter.manifest.configFields,
        capabilities: adapter.manifest.capabilities,
      }),
    );
  }

  audit(options: DestinationRegistryAuditOptions = {}): DestinationRegistryAuditResult {
    const warnings: string[] = [];
    const registeredKinds = new Set(this.adapters.keys());
    const enumKinds = new Set<DestinationKind>(DestinationKindSchema.options);

    for (const kind of enumKinds) {
      if (!registeredKinds.has(kind)) {
        warnings.push(`Destination kind is missing from registry: ${kind}`);
      }
    }

    for (const kind of registeredKinds) {
      if (!enumKinds.has(kind)) {
        warnings.push(`Destination registry contains a kind outside the core enum: ${kind}`);
      }

      const adapter = this.get(kind);
      const sensitivePaths = new Set(
        adapter.manifest.configFields.filter((field) => field.sensitive).map((field) => field.path),
      );
      const secretPaths = new Set(adapter.manifest.secretFields.map((field) => field.path));

      for (const path of sensitivePaths) {
        if (!secretPaths.has(path)) {
          warnings.push(`Destination ${kind} marks sensitive config without secret field: ${path}`);
        }
      }

      for (const key of destinationManifestMessageKeys(adapter.manifest)) {
        this.auditMessageKey(warnings, options.messageKeys, kind, key);
      }

      this.auditConfigFieldDefaults(warnings, kind, adapter);
    }

    const catalog = this.toCatalog();

    for (const item of catalog) {
      const unsafe = item as unknown as Record<string, unknown>;

      if (
        "secretFields" in unsafe ||
        "configSchema" in unsafe ||
        "preview" in unsafe ||
        "send" in unsafe
      ) {
        warnings.push(`Destination catalog item leaks runtime internals: ${item.kind}`);
      }
    }

    return { warnings };
  }

  get list(): DestinationAdapter[] {
    return [...this.adapters.values()];
  }

  /**
   * `configSchema` owns the runtime default of a config path; a manifest
   * `defaultValue` is only the console's initialization hint. The audit reads
   * the schema default by parsing the field's own subtree with `undefined`, so
   * a hint the runtime never applies (or one that disagrees with the schema)
   * fails the gate instead of drifting silently.
   */
  private auditConfigFieldDefaults(
    warnings: string[],
    kind: DestinationKind,
    adapter: DestinationAdapter,
  ): void {
    for (const field of adapter.manifest.configFields) {
      if (field.defaultValue === undefined) {
        continue;
      }

      const fieldSchema = resolveConfigSchemaPath(adapter.configSchema, field.path);

      if (!fieldSchema) {
        warnings.push(
          `Destination ${kind} declares a defaultValue for a config path its schema does not define: ${field.path}`,
        );
        continue;
      }

      const parsed = fieldSchema.safeParse(undefined);

      if (!parsed.success) {
        warnings.push(
          `Destination ${kind} declares defaultValue ${formatJson(field.defaultValue)} for a config path its schema requires: ${field.path}`,
        );
        continue;
      }

      if (!jsonValuesEqual(parsed.data, field.defaultValue)) {
        warnings.push(
          `Destination ${kind} defaultValue ${formatJson(field.defaultValue)} does not match the schema default ${formatJson(parsed.data)}: ${field.path}`,
        );
      }
    }
  }

  private auditMessageKey(
    warnings: string[],
    messageKeys: ReadonlySet<string> | undefined,
    kind: DestinationKind,
    key: string | undefined,
  ): void {
    if (messageKeys && key && !messageKeys.has(key)) {
      warnings.push(`Destination ${kind} references missing i18n key: ${key}`);
    }
  }
}

/**
 * Every message key a destination manifest can reference. Collected here so the
 * audit covers the same surface a console form derives from the manifest,
 * including template mode labels and help copy.
 */
function destinationManifestMessageKeys(manifest: DestinationManifest): string[] {
  const keys: string[] = [];

  addMessageKey(keys, manifest.displayNameKey);
  addMessageKey(keys, manifest.descriptionKey);
  addMessageKey(keys, manifest.lifecycle.messageKey);

  for (const field of manifest.configFields) {
    addMessageKey(keys, field.labelKey);
    addMessageKey(keys, field.descriptionKey);
    addMessageKey(keys, field.placeholderKey);

    if (field.type === "select") {
      for (const option of field.options) {
        addMessageKey(keys, option.labelKey);
      }
    }

    if (field.type === "template") {
      addHelpMessageKeys(keys, field.help);

      for (const mode of field.modes ?? []) {
        addMessageKey(keys, mode.labelKey);
        addMessageKey(keys, mode.descriptionKey);
        addHelpMessageKeys(keys, mode.help);
      }
    }
  }

  for (const field of manifest.secretFields) {
    addMessageKey(keys, field.labelKey);
  }

  return keys;
}

function addHelpMessageKeys(keys: string[], help: AdapterConfigHelp | undefined): void {
  if (!help) {
    return;
  }

  addMessageKey(keys, help.labelKey);
  addMessageKey(keys, help.descriptionKey);

  for (const link of help.links ?? []) {
    addMessageKey(keys, link.labelKey);
  }
}

function addMessageKey(keys: string[], key: string | undefined): void {
  if (key) {
    keys.push(key);
  }
}

/**
 * Resolves the zod subtree that owns one config dot path, unwrapping wrappers
 * that hide an object shape (for example an optional nested target).
 */
function resolveConfigSchemaPath(schema: unknown, path: string): z.ZodType | undefined {
  let current = schema;

  for (const segment of path.split(".")) {
    const shape = getZodShape(current);

    if (!shape || !Object.hasOwn(shape, segment)) {
      return undefined;
    }

    current = shape[segment] as z.ZodType;
  }

  return current as z.ZodType;
}

function getZodShape(schema: unknown): Record<string, unknown> | undefined {
  let current = schema;

  for (let depth = 0; depth < MaxConfigSchemaUnwrapDepth; depth += 1) {
    const shape = (current as { shape?: unknown }).shape;

    if (typeof shape === "object" && shape !== null && !Array.isArray(shape)) {
      return shape as Record<string, unknown>;
    }

    const unwrapped = unwrapZodSchema(current);

    if (!unwrapped) {
      return undefined;
    }

    current = unwrapped;
  }

  return undefined;
}

function unwrapZodSchema(schema: unknown): unknown {
  const unwrap = (schema as { unwrap?: unknown }).unwrap;

  if (typeof unwrap !== "function") {
    return undefined;
  }

  const unwrapped = (unwrap as () => unknown).call(schema);

  return unwrapped === schema ? undefined : unwrapped;
}

function jsonValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => jsonValuesEqual(value, right[index]))
    );
  }

  if (isJsonRecord(left) && isJsonRecord(right)) {
    const keys = Object.keys(left);

    return (
      keys.length === Object.keys(right).length &&
      keys.every((key) => Object.hasOwn(right, key) && jsonValuesEqual(left[key], right[key]))
    );
  }

  return false;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatJson(value: unknown): string {
  return JSON.stringify(value) ?? "undefined";
}

export function createDefaultDestinationRegistry(): DestinationRegistry {
  const registry = new DestinationRegistry();

  (
    [
      genericWebhookAdapter,
      feishuAdapter,
      slackAdapter,
      emailAdapter,
    ] satisfies DestinationAdapter[]
  ).forEach((adapter) => registry.register(adapter));

  return registry;
}
