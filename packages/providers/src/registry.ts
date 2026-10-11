import { SourceProviderSchema, type SourceProvider } from "@tocsin/core";

import { alertmanagerProviderAdapter } from "#providers/alertmanager/index";
import { fastgptProviderAdapter } from "#providers/fastgpt/index";
import { genericProviderAdapter } from "#providers/generic/index";
import { grafanaProviderAdapter } from "#providers/grafana/index";
import { signozProviderAdapter } from "#providers/signoz/index";
import type {
  ProviderAdapter,
  ProviderCatalogItem,
  ProviderParseInput,
  ProviderParseOutput,
  ProviderParseResult,
} from "#providers/types";
import { ProviderCatalogItemSchema, ProviderManifestSchema } from "#providers/types";
import { uptimeKumaProviderAdapter } from "#providers/uptime-kuma/index";
import { ParseResult } from "#providers/utils";

export interface ProviderRegistryAuditOptions {
  messageKeys?: ReadonlySet<string>;
}

export interface ProviderRegistryAuditResult {
  warnings: string[];
}

export class ProviderRegistry {
  private readonly adapters = new Map<SourceProvider, ProviderAdapter>();

  register(adapter: ProviderAdapter): void {
    const manifest = ProviderManifestSchema.parse(adapter.manifest);

    if (this.adapters.has(manifest.provider)) {
      throw new Error(`Provider adapter already registered: ${manifest.provider}`);
    }

    this.adapters.set(manifest.provider, adapter);
  }

  get(provider: SourceProvider): ProviderAdapter {
    const adapter = this.adapters.get(provider);

    if (!adapter) {
      throw new Error(`Unknown provider adapter: ${provider}`);
    }

    return adapter;
  }

  parse(provider: SourceProvider, input: ProviderParseInput<unknown>): ProviderParseResult {
    const adapter = this.get(provider);
    const config = adapter.configSchema.parse(input.config);

    try {
      return adapter.parse({ ...input, config });
    } catch (error) {
      return ParseResult.invalidPayload({
        error,
        provider,
        parserVersion: adapter.manifest.configVersion,
      });
    }
  }

  parseOrThrow(provider: SourceProvider, input: ProviderParseInput<unknown>): ProviderParseOutput {
    return ParseResult.unwrap(this.parse(provider, input));
  }

  parseConfig(provider: SourceProvider, config: unknown): unknown {
    return this.get(provider).configSchema.parse(config);
  }

  toCatalog(): ProviderCatalogItem[] {
    return this.list.map((adapter) =>
      ProviderCatalogItemSchema.parse({
        provider: adapter.manifest.provider,
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

  audit(options: ProviderRegistryAuditOptions = {}): ProviderRegistryAuditResult {
    const warnings: string[] = [];
    const registeredProviders = new Set(this.adapters.keys());
    const enumProviders = new Set(SourceProviderSchema.options);

    for (const provider of enumProviders) {
      if (!registeredProviders.has(provider)) {
        warnings.push(`Source provider is missing from registry: ${provider}`);
      }
    }

    for (const provider of registeredProviders) {
      if (!enumProviders.has(provider)) {
        warnings.push(`Provider registry contains provider outside core enum: ${provider}`);
      }

      const adapter = this.get(provider);
      const sensitivePaths = new Set(
        adapter.manifest.configFields.filter((field) => field.sensitive).map((field) => field.path),
      );
      const secretPaths = new Set(adapter.manifest.secretFields.map((field) => field.path));

      for (const path of sensitivePaths) {
        if (!secretPaths.has(path)) {
          warnings.push(
            `Provider ${provider} marks sensitive config without secret field: ${path}`,
          );
        }
      }

      this.auditMessageKey(
        warnings,
        options.messageKeys,
        provider,
        adapter.manifest.displayNameKey,
      );
      this.auditMessageKey(
        warnings,
        options.messageKeys,
        provider,
        adapter.manifest.descriptionKey,
      );
      this.auditMessageKey(
        warnings,
        options.messageKeys,
        provider,
        adapter.manifest.lifecycle.messageKey,
      );

      for (const field of adapter.manifest.configFields) {
        this.auditMessageKey(warnings, options.messageKeys, provider, field.labelKey);
        this.auditMessageKey(warnings, options.messageKeys, provider, field.descriptionKey);
        this.auditMessageKey(warnings, options.messageKeys, provider, field.placeholderKey);

        if (field.type === "select") {
          for (const option of field.options) {
            this.auditMessageKey(warnings, options.messageKeys, provider, option.labelKey);
          }
        }
      }

      for (const field of adapter.manifest.secretFields) {
        this.auditMessageKey(warnings, options.messageKeys, provider, field.labelKey);
      }
    }

    const catalog = this.toCatalog();

    for (const item of catalog) {
      const unsafe = item as unknown as Record<string, unknown>;

      if ("secretFields" in unsafe || "configSchema" in unsafe || "parse" in unsafe) {
        warnings.push(`Provider catalog item leaks runtime internals: ${item.provider}`);
      }
    }

    return { warnings };
  }

  get list(): ProviderAdapter[] {
    return [...this.adapters.values()];
  }

  private auditMessageKey(
    warnings: string[],
    messageKeys: ReadonlySet<string> | undefined,
    provider: SourceProvider,
    key: string | undefined,
  ): void {
    if (messageKeys && key && !messageKeys.has(key)) {
      warnings.push(`Provider ${provider} references missing i18n key: ${key}`);
    }
  }
}

export function createDefaultProviderRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();

  (
    [
      genericProviderAdapter,
      signozProviderAdapter,
      fastgptProviderAdapter,
      grafanaProviderAdapter,
      uptimeKumaProviderAdapter,
      alertmanagerProviderAdapter,
    ] satisfies ProviderAdapter[]
  ).forEach((adapter) => registry.register(adapter));

  return registry;
}

export type {
  ProviderAdapter,
  ProviderCatalogItem,
  ProviderParseInput,
  ProviderParseOutput,
  ProviderParseResult,
};
