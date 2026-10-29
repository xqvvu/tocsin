import { useForm } from "@tanstack/react-form";
import * as React from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import {
  Field as UiField,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import {
  sourceConfigFromForm,
  sourceConfigPatchFromForm,
} from "#/features/sources/model/source-form";
import type {
  SourceFormLayout,
  SourceFormSubmitInput,
  SourceFormValues,
  SourceSubmitResult,
} from "#/features/sources/ui/source-ui-types";
import { useTranslations } from "#/i18n/use-i18n";
import { cn } from "#/lib/utils";

export function SourceForm({
  defaultValues,
  pending,
  submitLabel,
  submitIcon,
  bodyFooter,
  onSubmit,
  onCancel,
  layout = "compact",
}: {
  defaultValues: SourceFormValues;
  pending: boolean;
  submitLabel: string;
  submitIcon: React.ReactNode;
  bodyFooter?: React.ReactNode;
  onSubmit: (input: SourceFormSubmitInput) => SourceSubmitResult;
  onCancel?: () => void;
  layout?: SourceFormLayout;
}) {
  const t = useTranslations();
  const isDialogLayout = layout === "dialog";

  const pendingConfig = React.useRef<SourceFormSubmitInput["config"]>(undefined);
  // The provider decides how every later payload is parsed, and switching it on
  // an existing source leaves stored events with the parse result they already
  // have. The save asks first; a non-null value is the switch awaiting an answer.
  const [pendingProviderChange, setPendingProviderChange] = React.useState<
    SourceFormValues["provider"] | null
  >(null);
  // Set once the operator confirmed a switch, so the re-run of the submit does
  // not ask again. It is compared by value: picking yet another provider asks
  // again, and a failed save can be retried without a second confirmation.
  const confirmedProviderChange = React.useRef<SourceFormValues["provider"] | null>(null);
  const providerItems = React.useMemo(
    () => [
      { value: "generic", label: t("sources.providers.genericWebhook") },
      { value: "grafana", label: t("sources.providers.grafana") },
      { value: "signoz", label: t("sources.providers.signoz") },
      { value: "uptime_kuma", label: t("sources.providers.uptime_kuma") },
      { value: "alertmanager", label: t("sources.providers.alertmanager") },
      { value: "fastgpt", label: t("sources.providers.fastgpt") },
    ],
    [t],
  );
  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      // Edit mode (`onCancel`) starts from a stored provider. A different one
      // changes how every later webhook is read, so the operator answers the
      // dialog below before anything is written.
      if (
        onCancel &&
        value.provider !== defaultValues.provider &&
        confirmedProviderChange.current !== value.provider
      ) {
        setPendingProviderChange(value.provider);
        return;
      }

      const config = pendingConfig.current;
      const result = await onSubmit({
        name: value.name.trim(),
        provider: value.provider,
        ...(config ? { config } : {}),
      });
      pendingConfig.current = undefined;

      if (!onCancel && result !== false) {
        form.reset();
      }
    },
  });

  const fields = (
    <>
      <FieldGroup className={layout === "rail" ? "gap-5" : "gap-3"}>
        <form.Field
          name="name"
          validators={{
            onSubmit: ({ value }) => {
              return value.trim().length === 0
                ? t("sources.form.validation.nameRequired")
                : undefined;
            },
          }}
        >
          {(field) => (
            <UiField data-invalid={field.state.meta.errors.length > 0}>
              <FieldLabel className={labelClassName(layout)} htmlFor={field.name}>
                {t("sources.form.nameLabel")}
              </FieldLabel>
              <Input
                id={field.name}
                name={field.name}
                className={inputClassName(layout)}
                placeholder={
                  layout === "rail"
                    ? t("sources.form.namePlaceholderRail")
                    : t("sources.form.namePlaceholderCompact")
                }
                value={field.state.value}
                aria-invalid={field.state.meta.errors.length > 0}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.currentTarget.value)}
              />
              {layout !== "rail" ? (
                <FieldDescription>{t("sources.form.nameDescription")}</FieldDescription>
              ) : null}
              <FieldError
                errors={field.state.meta.errors.map((error) => ({
                  message: String(error),
                }))}
              />
            </UiField>
          )}
        </form.Field>
        <form.Field name="provider">
          {(field) => (
            <UiField>
              <FieldLabel className={labelClassName(layout)} htmlFor={field.name}>
                {t("sources.form.providerLabel")}
              </FieldLabel>
              <Select
                id={field.name}
                name={field.name}
                items={providerItems}
                value={field.state.value}
                onValueChange={(value) => field.handleChange(value as SourceFormValues["provider"])}
              >
                <SelectTrigger
                  className={cn("w-full", inputClassName(layout))}
                  onBlur={field.handleBlur}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="generic">{t("sources.providers.genericWebhook")}</SelectItem>
                    <SelectItem value="grafana">{t("sources.providers.grafana")}</SelectItem>
                    <SelectItem value="signoz">{t("sources.providers.signoz")}</SelectItem>
                    <SelectItem value="uptime_kuma">
                      {t("sources.providers.uptime_kuma")}
                    </SelectItem>
                    <SelectItem value="alertmanager">
                      {t("sources.providers.alertmanager")}
                    </SelectItem>
                    <SelectItem value="fastgpt">{t("sources.providers.fastgpt")}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              {layout !== "rail" ? (
                <FieldDescription>{t("sources.form.providerDescription")}</FieldDescription>
              ) : null}
            </UiField>
          )}
        </form.Field>
      </FieldGroup>
      <UiField>
        <FieldLabel
          className={labelClassName(layout)}
          htmlFor={onCancel ? "edit-signingSecret" : "create-signingSecret"}
        >
          {onCancel
            ? t("sources.form.signingSecretOverrideLabel")
            : t("sources.form.signingSecretLabel")}
        </FieldLabel>
        <Input
          id={onCancel ? "edit-signingSecret" : "create-signingSecret"}
          name="signingSecret"
          type="password"
          className={inputClassName(layout)}
          placeholder={
            onCancel
              ? t("sources.form.signingSecretOverridePlaceholder")
              : t("sources.form.signingSecretPlaceholder")
          }
        />
        <FieldDescription>{t("sources.form.signingSecretDescription")}</FieldDescription>
      </UiField>
      {bodyFooter}
    </>
  );

  return (
    <>
      <form
        className={cn(
          "flex flex-col",
          isDialogLayout ? "min-h-0 flex-1 overflow-hidden" : layout === "rail" ? "gap-5" : "gap-2",
        )}
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const data = new FormData(event.currentTarget);
          pendingConfig.current = onCancel
            ? sourceConfigPatchFromForm(data)
            : sourceConfigFromForm(data);
          void form.handleSubmit();
        }}
      >
        {isDialogLayout ? (
          <div className="-mx-4 min-h-0 flex-1 overflow-y-auto">
            <div className="flex min-w-0 flex-col gap-3 px-4 pb-1">{fields}</div>
          </div>
        ) : (
          fields
        )}
        <div
          className={
            isDialogLayout
              ? "border-border bg-popover flex shrink-0 flex-col gap-2 border-t pt-3 sm:flex-row sm:justify-end"
              : onCancel
                ? "grid grid-cols-2 gap-2"
                : undefined
          }
        >
          {onCancel ? (
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onCancel}>
              {t("sources.form.cancel")}
            </Button>
          ) : null}
          <Button
            type="submit"
            size={layout === "rail" ? "lg" : "sm"}
            disabled={pending}
            className={isDialogLayout ? "w-full sm:w-fit" : onCancel ? "" : "w-full font-bold"}
          >
            {submitIcon}
            {submitLabel}
          </Button>
        </div>
      </form>
      <AlertDialog
        open={pendingProviderChange !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingProviderChange(null);
          }
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sources.form.providerChange.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("sources.form.providerChange.description", {
                previousProvider: t(`sources.providers.${defaultValues.provider}`),
                nextProvider: t(
                  `sources.providers.${pendingProviderChange ?? defaultValues.provider}`,
                ),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {t("sources.form.providerChange.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() => {
                confirmedProviderChange.current = pendingProviderChange;
                setPendingProviderChange(null);
                // Re-run the submit with the answer recorded. The values and
                // the pending config are still the ones the operator submitted.
                void form.handleSubmit();
              }}
            >
              {t("sources.form.providerChange.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function labelClassName(layout: SourceFormLayout): string | undefined {
  return layout === "rail"
    ? "text-muted-foreground text-[11px] font-semibold tracking-wider uppercase"
    : undefined;
}

function inputClassName(layout: SourceFormLayout): string | undefined {
  return layout === "rail" ? "h-12 bg-background px-3 text-sm" : undefined;
}
