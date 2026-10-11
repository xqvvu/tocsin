import "@tanstack/react-start/server-only";
import {
  ExportConfigurationCommandSchema,
  ImportConfigurationCommandSchema,
  ImportConfigurationJsonCommandSchema,
  type ExportConfigurationCommand,
  type ImportConfigurationResult,
  type ImportConfigurationCommand,
  type ImportConfigurationJsonCommand,
} from "@tocsin/core";

import {
  createPortableConfiguration,
  parsePortableConfigurationJson,
  parsePortableConfigurationToml,
  resolveDestinationSecretRefs,
  resolveFeishuAppSecretRefs,
  resolveSourceSecretRefs,
  serializePortableConfigurationJson,
  serializePortableConfigurationToml,
  type ExportConfigurationOptions,
  type ImportConfigurationOptions,
  type PortableConfiguration,
} from "#/server/configuration/config-portability";
import type { ConfigPortabilityServiceOptions } from "#/server/configuration/config-portability.service.types";
import {
  generateSourceToken as defaultGenerateSourceToken,
  parseDestinationConfig,
  requireExistingDestinationIds,
  requireExistingFeishuAppRefs,
  requireExistingSourceIds,
} from "#/server/configuration/configuration-support";
import { hashSourceToken } from "#/server/intake/intake.service";

export class ConfigPortabilityService {
  private readonly store: ConfigPortabilityServiceOptions["store"];
  private readonly destinations: ConfigPortabilityServiceOptions["destinations"];
  private readonly generateSourceToken: () => string;

  constructor(options: ConfigPortabilityServiceOptions) {
    this.store = options.store;
    this.destinations = options.destinations;
    this.generateSourceToken = options.generateSourceToken ?? defaultGenerateSourceToken;
  }

  async exportToml(options: ExportConfigurationOptions = {}): Promise<string> {
    return serializePortableConfigurationToml(await this.createPortableConfiguration(options));
  }

  async exportJson(options: ExportConfigurationOptions = {}): Promise<string> {
    return serializePortableConfigurationJson(await this.createPortableConfiguration(options));
  }

  async exportTomlFromCommand(command: ExportConfigurationCommand = {}): Promise<string> {
    const input = ExportConfigurationCommandSchema.parse(command) ?? {};

    return this.exportToml({
      includeSecrets: input.includeSecrets ?? false,
    });
  }

  async exportJsonFromCommand(command: ExportConfigurationCommand = {}): Promise<string> {
    const input = ExportConfigurationCommandSchema.parse(command) ?? {};

    return this.exportJson({
      includeSecrets: input.includeSecrets ?? false,
    });
  }

  private async createPortableConfiguration(
    options: ExportConfigurationOptions,
  ): Promise<PortableConfiguration> {
    const sourceSummaries = await this.store.sources.list();
    const sources = (
      await Promise.all(sourceSummaries.map((source) => this.store.sources.get(source.id)))
    ).filter((source): source is NonNullable<typeof source> => source !== null);
    const feishuApps = await this.store.feishuApps.list();
    const destinations = await this.store.destinations.list();
    const routes = await this.store.routes.list();

    return createPortableConfiguration(
      {
        feishuApps,
        sources,
        destinations,
        routes,
        settings: await this.store.settings.get(),
      },
      options,
    );
  }

  async importTomlFromCommand(
    command: ImportConfigurationCommand,
  ): Promise<ImportConfigurationResult> {
    const input = ImportConfigurationCommandSchema.parse(command);

    return this.importToml(input.toml, {
      env: process.env,
    });
  }

  async importJsonFromCommand(
    command: ImportConfigurationJsonCommand,
  ): Promise<ImportConfigurationResult> {
    const input = ImportConfigurationJsonCommandSchema.parse(command);

    return this.importJson(input.json, {
      env: process.env,
    });
  }

  async importJson(
    json: string,
    options: ImportConfigurationOptions = {},
  ): Promise<ImportConfigurationResult> {
    return this.importPortableConfiguration(parsePortableConfigurationJson(json), options);
  }

  async importToml(
    toml: string,
    options: ImportConfigurationOptions = {},
  ): Promise<ImportConfigurationResult> {
    return this.importPortableConfiguration(parsePortableConfigurationToml(toml), options);
  }

  private async importPortableConfiguration(
    portable: PortableConfiguration,
    options: ImportConfigurationOptions,
  ): Promise<ImportConfigurationResult> {
    const generatedSourceTokens: ImportConfigurationResult["generatedSourceTokens"] = [];

    await this.store.transaction(async (tx) => {
      await tx.settings.update({
        locale: portable.settings.locale,
        timeZone: portable.settings.timeZone,
        rawPayloadRetentionDays: portable.settings.rawPayloadRetentionDays,
      });

      for (const source of portable.sources.map((entry) =>
        resolveSourceSecretRefs(entry, options),
      )) {
        const existing = await tx.sources.get(source.id);

        if (existing) {
          await tx.sources.update(source.id, {
            name: source.name,
            provider: source.provider,
            enabled: source.enabled,
            config: source.config,
          });
          continue;
        }

        const token = this.generateSourceToken();
        await tx.sources.create({
          id: source.id,
          name: source.name,
          provider: source.provider,
          enabled: source.enabled,
          config: source.config,
          tokenHash: hashSourceToken(token),
        });
        generatedSourceTokens.push({
          sourceId: source.id,
          sourceName: source.name,
          token,
        });
      }

      for (const app of portable.feishuApps.map((entry) =>
        resolveFeishuAppSecretRefs(entry, options),
      )) {
        const existing = await tx.feishuApps.get(app.id);

        if (existing) {
          await tx.feishuApps.update(app.id, {
            name: app.name,
            appId: app.appId,
            appSecret: app.appSecret,
          });
          continue;
        }

        await tx.feishuApps.create({
          id: app.id,
          name: app.name,
          appId: app.appId,
          appSecret: app.appSecret,
        });
      }

      for (const destination of portable.destinations.map((entry) =>
        resolveDestinationSecretRefs(entry, options),
      )) {
        const existing = await tx.destinations.get(destination.id);
        const config = parseDestinationConfig(
          this.destinations,
          destination.kind,
          destination.config,
        );

        await requireExistingFeishuAppRefs(config, tx.feishuApps);

        if (existing) {
          await tx.destinations.update(destination.id, {
            name: destination.name,
            kind: destination.kind,
            enabled: destination.enabled,
            config,
            secretRefs: destination.secretRefs,
          });
          continue;
        }

        await tx.destinations.create({
          id: destination.id,
          name: destination.name,
          kind: destination.kind,
          enabled: destination.enabled,
          config,
          secretRefs: destination.secretRefs,
        });
      }

      for (const route of portable.routes) {
        const existing = await tx.routes.get(route.id);

        await requireExistingSourceIds(route.rule.sourceIds, tx.sources);
        await requireExistingDestinationIds(route.destinationIds, tx.destinations);

        if (existing) {
          await tx.routes.update(route.id, {
            name: route.name,
            enabled: route.enabled,
            rule: route.rule,
            destinationIds: route.destinationIds,
          });
          continue;
        }

        await tx.routes.create({
          id: route.id,
          name: route.name,
          enabled: route.enabled,
          rule: route.rule,
          destinationIds: route.destinationIds,
        });
      }
    });

    return { generatedSourceTokens };
  }
}
