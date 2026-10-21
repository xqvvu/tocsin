import { RiSave3Line } from "@remixicon/react";
import { useForm } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import type { AppSettings } from "@tocsin/core";

import { Button } from "#/components/ui/button";
import {
  Field as UiField,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "#/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "#/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { appSettingsQueryOptions } from "#/features/configuration/api/configuration.queries";
import { useAppSettingsMutation } from "#/features/configuration/api/use-app-settings-mutation";
import { settingsPreferencesPanelClassName } from "#/features/configuration/model/settings-layout";
import { SettingsTimeZoneCombobox } from "#/features/configuration/ui/settings-time-zone-combobox";
import { writeLocaleCookie } from "#/i18n/locale-cookie";
import { localeDisplayName, supportedLocales, type AppLocale } from "#/i18n/locales";
import { useTranslations } from "#/i18n/use-i18n";
import { hardReloadPage } from "#/lib/browser";

export function SettingsPreferencesPanel() {
  const t = useTranslations();
  const { data: settings } = useSuspenseQuery(appSettingsQueryOptions());
  const mutation = useAppSettingsMutation();

  const form = useForm({
    defaultValues: {
      locale: settings.locale,
      timeZone: settings.timeZone,
      rawPayloadRetentionDays: settings.rawPayloadRetentionDays,
    },
    onSubmit: ({ value }) => {
      return onSubmit({
        locale: value.locale,
        timeZone: value.timeZone,
        rawPayloadRetentionDays: Number(value.rawPayloadRetentionDays),
      });
    },
  });

  async function onSubmit(input: AppSettings) {
    try {
      const updated = await mutation.mutateAsync(input);
      writeLocaleCookie(updated.locale);
      hardReloadPage();
    } catch (error) {
      toast.error(t("configuration.settings.operationFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <form
      key={`${settings.locale}:${settings.timeZone}:${settings.rawPayloadRetentionDays}`}
      className={settingsPreferencesPanelClassName}
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <FieldGroup className="w-full max-w-lg gap-6">
          <FieldSet className="gap-3">
            <FieldGroup className="gap-4">
              <form.Field name="locale">
                {(field) => (
                  <UiField>
                    <FieldLabel htmlFor={field.name}>
                      {t("configuration.appSettings.language")}
                    </FieldLabel>
                    <Select
                      items={supportedLocales.map((locale) => ({
                        value: locale,
                        label: localeDisplayName(locale),
                      }))}
                      value={field.state.value}
                      onValueChange={(value) => field.handleChange(value as AppLocale)}
                    >
                      <SelectTrigger id={field.name} className="w-full" onBlur={field.handleBlur}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {supportedLocales.map((locale) => (
                            <SelectItem key={locale} value={locale}>
                              {localeDisplayName(locale)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      {t("configuration.appSettings.languageDescription")}
                    </FieldDescription>
                  </UiField>
                )}
              </form.Field>

              <form.Field
                name="timeZone"
                validators={{
                  onSubmit: ({ value }) => {
                    try {
                      new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
                      return undefined;
                    } catch {
                      return t("configuration.appSettings.timeZoneValidation");
                    }
                  },
                }}
              >
                {(field) => (
                  <UiField data-invalid={field.state.meta.errors.length > 0}>
                    <FieldLabel htmlFor={field.name}>
                      {t("configuration.appSettings.timeZone")}
                    </FieldLabel>
                    <SettingsTimeZoneCombobox
                      id={field.name}
                      invalid={field.state.meta.errors.length > 0}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={field.handleChange}
                    />
                    <FieldDescription>
                      {t("configuration.appSettings.timeZoneDescription")}
                    </FieldDescription>
                    <FieldError
                      errors={field.state.meta.errors.map((error) => ({
                        message: String(error),
                      }))}
                    />
                  </UiField>
                )}
              </form.Field>
            </FieldGroup>
          </FieldSet>

          <FieldSet className="gap-3">
            <form.Field
              name="rawPayloadRetentionDays"
              validators={{
                onSubmit: ({ value }) => {
                  return Number.isFinite(value) && value >= 0 && value <= 3650
                    ? undefined
                    : t("configuration.appSettings.rawPayloadRetentionValidation");
                },
              }}
            >
              {(field) => (
                <UiField data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor={field.name}>
                    {t("configuration.appSettings.rawPayloadRetentionDays")}
                  </FieldLabel>
                  <InputGroup className="max-w-40">
                    <InputGroupInput
                      id={field.name}
                      name={field.name}
                      type="number"
                      min={0}
                      max={3650}
                      required
                      value={String(field.state.value)}
                      aria-invalid={field.state.meta.errors.length > 0}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.currentTarget.valueAsNumber)}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>{t("configuration.summary.days")}</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                  <FieldDescription>
                    {t("configuration.appSettings.rawPayloadRetentionDescription")}
                  </FieldDescription>
                  <FieldError
                    errors={field.state.meta.errors.map((error) => ({
                      message: String(error),
                    }))}
                  />
                </UiField>
              )}
            </form.Field>
          </FieldSet>
        </FieldGroup>
      </FieldGroup>
      <footer className="border-border bg-muted/30 flex shrink-0 flex-col-reverse gap-2 border-t px-3 pt-3 sm:flex-row sm:justify-end">
        <Button type="submit" size="sm" disabled={mutation.isPending} className="sm:shrink-0">
          <RiSave3Line data-icon="inline-start" aria-hidden />
          {t("common.actions.saveSettings")}
        </Button>
      </footer>
    </form>
  );
}
