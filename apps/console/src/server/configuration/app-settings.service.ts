import {
  UpdateAppSettingsCommandSchema,
  type AppSettings,
  type UpdateAppSettingsCommand,
} from "@tocsin/core";

import type {
  AppSettingsServiceOptions,
  UpdateAppSettingsOptions,
  UpdateAppSettingsResult,
} from "#/server/configuration/app-settings.service.types";

export class AppSettingsService {
  private readonly store: AppSettingsServiceOptions["store"];

  constructor(options: AppSettingsServiceOptions) {
    this.store = options.store;
  }

  async getAppSettings(): Promise<AppSettings> {
    return this.store.settings.get();
  }

  async updateAppSettings(
    command: UpdateAppSettingsCommand,
    options: UpdateAppSettingsOptions = {},
  ): Promise<UpdateAppSettingsResult> {
    const input = UpdateAppSettingsCommandSchema.parse(command);

    return this.store.settings.update({
      ...(input.locale === undefined ? {} : { locale: input.locale }),
      ...(input.timeZone === undefined ? {} : { timeZone: input.timeZone }),
      ...(input.deliveryPaused === undefined ? {} : { deliveryPaused: input.deliveryPaused }),
      ...(input.rawPayloadRetentionDays === undefined
        ? {}
        : { rawPayloadRetentionDays: input.rawPayloadRetentionDays }),
      ...(options.actor === undefined ? {} : { actor: options.actor }),
    });
  }
}
