import { useForm } from "@tanstack/react-form";
import * as React from "react";
import { toast } from "sonner";

import type { FeishuAppSummary } from "@tocsin/core";

import { ConfigurationDialogContent } from "#/components/common/configuration-dialog-content";
import { Button } from "#/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import {
  Field as UiField,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { useFeishuAppMutations } from "#/features/integrations/api/feishu-app.mutations";
import {
  emptyFeishuAppFormValues,
  feishuAppCreateCommandFromValues,
  feishuAppFormValuesFromApp,
  feishuAppUpdateCommandFromValues,
} from "#/features/integrations/model/feishu-app-form";
import { useTranslations } from "#/i18n/use-i18n";

export interface FeishuAppDialogProps {
  /** `null` opens the create flow; an app opens the edit flow. */
  app: FeishuAppSummary | null;
  open: boolean;
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeishuAppDialog({
  app,
  open,
  disabled = false,
  onOpenChange,
}: FeishuAppDialogProps) {
  const t = useTranslations();
  const [pending, setPending] = React.useState(false);
  const { createFeishuApp, invalidateFeishuApps, updateFeishuApp } = useFeishuAppMutations();
  const isEdit = app !== null;
  const form = useForm({
    defaultValues: app ? feishuAppFormValuesFromApp(app) : emptyFeishuAppFormValues,
    onSubmit: async ({ value }) => {
      setPending(true);

      try {
        if (app) {
          await updateFeishuApp(feishuAppUpdateCommandFromValues(app.id, value));
        } else {
          await createFeishuApp(feishuAppCreateCommandFromValues(value));
        }

        await invalidateFeishuApps();
        form.reset();
        onOpenChange(false);
      } catch (error) {
        toast.error(t("integrations.page.operationFailed"), {
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setPending(false);
      }
    },
  });
  const busy = pending || disabled;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!busy) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <ConfigurationDialogContent>
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>
            {isEdit ? t("integrations.form.editTitle") : t("integrations.form.createTitle")}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t("integrations.form.editDescription")
              : t("integrations.form.createDescription")}
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <FieldGroup className="gap-3">
            <form.Field
              name="name"
              validators={{
                onSubmit: ({ value }) =>
                  value.trim().length === 0
                    ? t("integrations.form.validation.nameRequired")
                    : undefined,
              }}
            >
              {(field) => (
                <UiField data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor={field.name}>{t("integrations.form.nameLabel")}</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    placeholder={t("integrations.form.namePlaceholder")}
                    value={field.state.value}
                    required
                    aria-invalid={field.state.meta.errors.length > 0}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.currentTarget.value)}
                  />
                  <FieldDescription>{t("integrations.form.nameDescription")}</FieldDescription>
                  <FieldError
                    errors={field.state.meta.errors.map((error) => ({
                      message: String(error),
                    }))}
                  />
                </UiField>
              )}
            </form.Field>

            <form.Field
              name="appId"
              validators={{
                onSubmit: ({ value }) =>
                  value.trim().length === 0
                    ? t("integrations.form.validation.appIdRequired")
                    : undefined,
              }}
            >
              {(field) => (
                <UiField data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor={field.name}>{t("integrations.form.appIdLabel")}</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    placeholder={t("integrations.form.appIdPlaceholder")}
                    value={field.state.value}
                    required
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={field.state.meta.errors.length > 0}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.currentTarget.value)}
                  />
                  <FieldDescription>{t("integrations.form.appIdDescription")}</FieldDescription>
                  <FieldError
                    errors={field.state.meta.errors.map((error) => ({
                      message: String(error),
                    }))}
                  />
                </UiField>
              )}
            </form.Field>

            <form.Field
              name="appSecret"
              validators={{
                onSubmit: ({ value }) =>
                  !isEdit && value.length === 0
                    ? t("integrations.form.validation.appSecretRequired")
                    : undefined,
              }}
            >
              {(field) => (
                <UiField data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor={field.name}>
                    {t("integrations.form.appSecretLabel")}
                  </FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="password"
                    placeholder={
                      isEdit
                        ? t("integrations.form.appSecretKeepPlaceholder")
                        : t("integrations.form.appSecretPlaceholder")
                    }
                    value={field.state.value}
                    required={!isEdit}
                    autoComplete="new-password"
                    spellCheck={false}
                    aria-invalid={field.state.meta.errors.length > 0}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.currentTarget.value)}
                  />
                  <FieldDescription>
                    {isEdit
                      ? t("integrations.form.appSecretKeepHint")
                      : t("integrations.form.appSecretDescription")}
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

          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              {t("integrations.form.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {isEdit ? t("integrations.form.submitSave") : t("integrations.form.submitCreate")}
            </Button>
          </div>
        </form>
      </ConfigurationDialogContent>
    </Dialog>
  );
}
