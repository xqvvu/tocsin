import { RiAddLine, RiEditLine, RiSaveLine, RiShieldCheckLine } from "@remixicon/react";
import * as React from "react";

import type {
  DestinationListItem,
  SourceSummary,
  Suppression,
  SuppressionKind,
  SuppressionMatcher,
} from "@tocsin/core";

import { FormPanel } from "#/components/common/content-panel";
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
import { Checkbox } from "#/components/ui/checkbox";
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
  defaultSuppressionWindow,
  emptySuppressionMatcher,
  isoFromDatetimeLocal,
  suppressionFormDefaultsFromRule,
  suppressionKindValues,
  suppressionMatcherFromValues,
  suppressionMatcherIsEmpty,
  suppressionSeverityValues,
  suppressionStatusValues,
  type SuppressionFormValues,
} from "#/features/suppressions/model/suppression-form";
import { UrgentImpactPreview } from "#/features/suppressions/ui/urgent-impact-preview";
import { useTranslations } from "#/i18n/use-i18n";
import { cn } from "#/lib/utils";

export interface SuppressionFormSubmission {
  name: string;
  kind: SuppressionKind;
  reason: string | null;
  enabled: boolean;
  startsAt: string;
  endsAt: string;
  matcher: SuppressionMatcher;
}

export function CreateSuppressionForm({
  showHeader = true,
  sources,
  destinations,
  layout = "panel",
  pending,
  onSubmit,
}: {
  showHeader?: boolean;
  sources: SourceSummary[];
  destinations: DestinationListItem[];
  layout?: "dialog" | "panel";
  pending: boolean;
  onSubmit: (input: SuppressionFormSubmission) => void;
}) {
  const t = useTranslations();
  const window = React.useMemo(() => defaultSuppressionWindow(), []);
  const form = (
    <SuppressionForm
      sources={sources}
      destinations={destinations}
      layout={layout}
      pending={pending}
      defaultValues={{
        name: "",
        kind: "silence",
        reason: "",
        enabled: true,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        matcher: emptySuppressionMatcher(),
      }}
      submitLabel={t("suppressions.form.create.submit")}
      submitIcon={<RiAddLine data-icon="inline-start" aria-hidden />}
      resetOnSubmit
      onSubmit={onSubmit}
    />
  );

  if (!showHeader) {
    return form;
  }

  return (
    <FormPanel
      title={t("suppressions.form.create.title")}
      icon={<RiShieldCheckLine className="size-4" aria-hidden />}
    >
      <p className="text-muted-foreground mb-3 text-xs">
        {t("suppressions.form.create.description")}
      </p>
      {form}
    </FormPanel>
  );
}

export function EditSuppressionForm({
  suppression,
  sources,
  destinations,
  pending,
  onCancel,
  onSubmit,
}: {
  suppression: Suppression;
  sources: SourceSummary[];
  destinations: DestinationListItem[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: SuppressionFormSubmission & { id: string }) => void;
}) {
  const t = useTranslations();

  return (
    <section className="border-border bg-muted/30 border p-3">
      <h3 className="flex items-center gap-2 text-xs font-semibold">
        <RiEditLine className="size-3.5" aria-hidden />
        {t("suppressions.form.edit.title")}
      </h3>
      <p className="text-muted-foreground mt-1 mb-3 text-xs">
        {t("suppressions.form.edit.description")}
      </p>
      <SuppressionForm
        key={suppression.id}
        sources={sources}
        destinations={destinations}
        pending={pending}
        defaultValues={suppressionFormDefaultsFromRule(suppression)}
        submitLabel={t("suppressions.form.edit.submit")}
        submitIcon={<RiSaveLine data-icon="inline-start" aria-hidden />}
        onSubmit={(values) => onSubmit({ ...values, id: suppression.id })}
        onCancel={onCancel}
      />
    </section>
  );
}

function SuppressionForm({
  sources,
  destinations,
  layout = "panel",
  pending,
  defaultValues,
  submitLabel,
  submitIcon,
  resetOnSubmit = false,
  onSubmit,
  onCancel,
}: {
  sources: SourceSummary[];
  destinations: DestinationListItem[];
  layout?: "dialog" | "panel";
  pending: boolean;
  defaultValues: SuppressionFormValues;
  submitLabel: string;
  submitIcon: React.ReactNode;
  resetOnSubmit?: boolean;
  onSubmit: (input: SuppressionFormSubmission) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations();
  const isDialogLayout = layout === "dialog";
  const [values, setValues] = React.useState(defaultValues);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmEmptyMatcherOpen, setConfirmEmptyMatcherOpen] = React.useState(false);
  const matcher = React.useMemo(
    () => suppressionMatcherFromValues(values.matcher),
    [values.matcher],
  );

  function update(patch: Partial<SuppressionFormValues>): void {
    setValues((current) => ({ ...current, ...patch }));
  }

  function updateMatcher(patch: Partial<SuppressionMatcher>): void {
    setValues((current) => ({ ...current, matcher: { ...current.matcher, ...patch } }));
  }

  function submit(options: { confirmEmptyMatcher?: boolean } = {}): void {
    const startsAt = isoFromDatetimeLocal(values.startsAt);
    const endsAt = isoFromDatetimeLocal(values.endsAt);

    if (values.name.trim().length === 0) {
      setError(t("suppressions.form.validation.nameRequired"));
      return;
    }

    if (!startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) {
      setError(t("suppressions.form.validation.windowInvalid"));
      return;
    }

    // A matcher with no conditions silences everything. Legal, but never by
    // accident: the operator confirms the blast radius first (story 4).
    if (suppressionMatcherIsEmpty(matcher) && options.confirmEmptyMatcher !== true) {
      setConfirmEmptyMatcherOpen(true);
      return;
    }

    setError(null);
    onSubmit({
      name: values.name.trim(),
      kind: values.kind,
      reason: values.reason.trim().length > 0 ? values.reason.trim() : null,
      enabled: values.enabled,
      startsAt,
      endsAt,
      matcher,
    });

    if (resetOnSubmit) {
      const window = defaultSuppressionWindow();

      setValues({
        name: "",
        kind: "silence",
        reason: "",
        enabled: true,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        matcher: emptySuppressionMatcher(),
      });
      setConfirmEmptyMatcherOpen(false);
    }
  }

  const kindItems = suppressionKindValues.map((kind) => ({
    value: kind,
    label: t(`suppressions.kind.${kind}`),
  }));
  const fields = (
    <FieldGroup className={isDialogLayout ? "gap-3" : "gap-2"}>
      <UiField>
        <FieldLabel htmlFor="suppression-name">{t("suppressions.form.nameLabel")}</FieldLabel>
        <Input
          id="suppression-name"
          name="suppression-name"
          placeholder={t("suppressions.form.namePlaceholder")}
          value={values.name}
          required
          onChange={(event) => update({ name: event.currentTarget.value })}
        />
        <FieldDescription>{t("suppressions.form.nameDescription")}</FieldDescription>
      </UiField>
      <UiField>
        <FieldLabel htmlFor="suppression-kind">{t("suppressions.form.kindLabel")}</FieldLabel>
        <Select
          id="suppression-kind"
          name="suppression-kind"
          items={kindItems}
          value={values.kind}
          onValueChange={(value) => update({ kind: (value ?? "silence") as SuppressionKind })}
        >
          <SelectTrigger className="w-full" aria-label={t("suppressions.form.kindLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {kindItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>{t("suppressions.form.kindDescription")}</FieldDescription>
      </UiField>
      <UiField>
        <FieldLabel htmlFor="suppression-reason">{t("suppressions.form.reasonLabel")}</FieldLabel>
        <Input
          id="suppression-reason"
          name="suppression-reason"
          placeholder={t("suppressions.form.reasonPlaceholder")}
          value={values.reason}
          onChange={(event) => update({ reason: event.currentTarget.value })}
        />
        <FieldDescription>{t("suppressions.form.reasonDescription")}</FieldDescription>
      </UiField>
      <div className="grid gap-2 sm:grid-cols-2">
        <UiField>
          <FieldLabel htmlFor="suppression-starts-at">
            {t("suppressions.form.startsAtLabel")}
          </FieldLabel>
          <Input
            id="suppression-starts-at"
            name="suppression-starts-at"
            type="datetime-local"
            value={values.startsAt}
            required
            onChange={(event) => update({ startsAt: event.currentTarget.value })}
          />
        </UiField>
        <UiField>
          <FieldLabel htmlFor="suppression-ends-at">
            {t("suppressions.form.endsAtLabel")}
          </FieldLabel>
          <Input
            id="suppression-ends-at"
            name="suppression-ends-at"
            type="datetime-local"
            value={values.endsAt}
            required
            onChange={(event) => update({ endsAt: event.currentTarget.value })}
          />
          <FieldDescription>{t("suppressions.form.endsAtDescription")}</FieldDescription>
        </UiField>
      </div>
      <UiField>
        <FieldLabel>{t("suppressions.form.matcherLegend")}</FieldLabel>
        <FieldDescription>{t("suppressions.form.matcherDescription")}</FieldDescription>
      </UiField>
      <OptionChecklist
        label={t("suppressions.form.sourcesLabel")}
        description={t("suppressions.form.sourcesDescription")}
        options={sources.map((source) => ({ value: source.id, label: source.name }))}
        selected={matcher.sourceIds}
        onChange={(sourceIds) => updateMatcher({ sourceIds })}
      />
      <OptionChecklist
        label={t("suppressions.form.destinationsLabel")}
        description={t("suppressions.form.destinationsDescription")}
        options={destinations.map((destination) => ({
          value: destination.id,
          label: destination.name,
        }))}
        selected={matcher.destinationIds}
        onChange={(destinationIds) => updateMatcher({ destinationIds })}
      />
      <OptionChecklist
        label={t("suppressions.form.severitiesLabel")}
        description={t("suppressions.form.severitiesDescription")}
        options={suppressionSeverityValues.map((severity) => ({
          value: severity,
          label: t(`common.severity.${severity}`),
        }))}
        selected={matcher.severities}
        onChange={(severities) =>
          updateMatcher({ severities: severities as SuppressionMatcher["severities"] })
        }
      />
      <OptionChecklist
        label={t("suppressions.form.statusesLabel")}
        description={t("suppressions.form.statusesDescription")}
        options={suppressionStatusValues.map((status) => ({
          value: status,
          label: t(`common.alertStatus.${status}`),
        }))}
        selected={matcher.statuses}
        onChange={(statuses) =>
          updateMatcher({ statuses: statuses as SuppressionMatcher["statuses"] })
        }
      />
      <RepeatableTextList
        label={t("suppressions.form.fingerprintsLabel")}
        description={t("suppressions.form.fingerprintsDescription")}
        placeholder="disk:full"
        values={values.matcher.fingerprints}
        onChange={(fingerprints) => updateMatcher({ fingerprints })}
      />
      <LabelConditionList
        values={values.matcher.labels}
        onChange={(labels) => updateMatcher({ labels })}
      />
      <RepeatableTextList
        label={t("suppressions.form.titleContainsLabel")}
        description={t("suppressions.form.titleContainsDescription")}
        placeholder="LatencyHigh"
        values={values.matcher.titleContains}
        onChange={(titleContains) => updateMatcher({ titleContains })}
      />
      <RepeatableTextList
        label={t("suppressions.form.messageContainsLabel")}
        description={t("suppressions.form.messageContainsDescription")}
        placeholder="timeout"
        values={values.matcher.messageContains}
        onChange={(messageContains) => updateMatcher({ messageContains })}
      />
      <UrgentImpactPreview destinations={destinations} matcher={matcher} />
      <UiField>
        <label className="flex items-center gap-2 text-xs font-medium">
          <Checkbox
            name="suppression-enabled"
            checked={values.enabled}
            onCheckedChange={(checked: boolean) => update({ enabled: checked })}
          />
          {t("suppressions.form.enabledLabel")}
        </label>
        <FieldDescription>{t("suppressions.form.enabledDescription")}</FieldDescription>
      </UiField>
      <FieldError errors={error ? [{ message: error }] : []} />
    </FieldGroup>
  );

  return (
    <>
      <form
        className={cn("flex flex-col", isDialogLayout ? "min-h-0 flex-1 overflow-hidden" : "gap-2")}
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          submit();
        }}
      >
        {isDialogLayout ? (
          <div className="-mx-4 min-h-0 flex-1 overflow-y-auto">
            <div className="flex min-w-0 flex-col px-4 pb-1">{fields}</div>
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
              {t("suppressions.form.cancel")}
            </Button>
          ) : null}
          <Button
            type="submit"
            size="sm"
            disabled={pending}
            className={isDialogLayout ? "w-full sm:w-fit" : onCancel ? "" : "w-full"}
          >
            {submitIcon}
            {submitLabel}
          </Button>
        </div>
      </form>
      <AlertDialog open={confirmEmptyMatcherOpen} onOpenChange={setConfirmEmptyMatcherOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("suppressions.form.emptyMatcher.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("suppressions.form.emptyMatcher.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {t("suppressions.form.emptyMatcher.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() => {
                // The matcher is genuinely empty; consent was given.
                setConfirmEmptyMatcherOpen(false);
                submit({ confirmEmptyMatcher: true });
              }}
            >
              {t("suppressions.form.emptyMatcher.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** A multi-select rendered as checkboxes; empty means "no restriction". */
function OptionChecklist({
  label,
  description,
  options,
  selected,
  onChange,
}: {
  label: string;
  description: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  return (
    <UiField>
      <FieldLabel>{label}</FieldLabel>
      <div className="border-input flex max-h-40 flex-wrap gap-x-4 gap-y-2 overflow-y-auto border p-2">
        {options.length === 0 ? (
          <span className="text-muted-foreground text-xs italic">
            {description /* the empty list is explained by the field description */}
          </span>
        ) : (
          options.map((option) => {
            const checked = selected.includes(option.value);

            return (
              <label key={option.value} className="flex items-center gap-2 text-xs">
                <Checkbox
                  name={`${label}-${option.value}`}
                  checked={checked}
                  onCheckedChange={(nextChecked: boolean) =>
                    onChange(
                      nextChecked
                        ? [...selected, option.value]
                        : selected.filter((value) => value !== option.value),
                    )
                  }
                />
                <span className="truncate">{option.label}</span>
              </label>
            );
          })
        )}
      </div>
      <FieldDescription>{description}</FieldDescription>
    </UiField>
  );
}

function RepeatableTextList({
  label,
  description,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  description: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const t = useTranslations();

  return (
    <UiField>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex w-full flex-col gap-1">
        {values.map((value, index) => (
          <div key={index} className="flex w-full items-center gap-1">
            <Input
              value={value}
              placeholder={placeholder}
              aria-label={`${label} ${index + 1}`}
              onChange={(event) => onChange(replaceAt(values, index, event.currentTarget.value))}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`${t("suppressions.form.removeCondition")}: ${label} ${index + 1}`}
              onClick={() => onChange(removeAt(values, index))}
            >
              {t("suppressions.form.removeCondition")}
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="w-fit"
        aria-label={`${t("suppressions.form.addCondition")}: ${label}`}
        onClick={() => onChange([...values, ""])}
      >
        <RiAddLine data-icon="inline-start" aria-hidden />
        {t("suppressions.form.addCondition")}
      </Button>
      <FieldDescription>{description}</FieldDescription>
    </UiField>
  );
}

function LabelConditionList({
  values,
  onChange,
}: {
  values: SuppressionMatcher["labels"];
  onChange: (values: SuppressionMatcher["labels"]) => void;
}) {
  const t = useTranslations();
  const operatorItems = [
    { value: "equals", label: t("suppressions.form.operatorEquals") },
    { value: "contains", label: t("suppressions.form.operatorContains") },
  ];

  return (
    <UiField>
      <FieldLabel>{t("suppressions.form.labelsLabel")}</FieldLabel>
      <div className="flex w-full flex-col gap-1">
        {values.map((label, index) => (
          <div
            key={index}
            className="grid w-full items-center gap-1 sm:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <Input
              value={label.key}
              placeholder="env"
              aria-label={`${t("suppressions.form.labelKeyLabel")} ${index + 1}`}
              onChange={(event) =>
                onChange(replaceAt(values, index, { ...label, key: event.currentTarget.value }))
              }
            />
            <Select
              items={operatorItems}
              value={label.operator}
              onValueChange={(value) =>
                onChange(
                  replaceAt(values, index, {
                    ...label,
                    operator: (value ??
                      "equals") as SuppressionMatcher["labels"][number]["operator"],
                  }),
                )
              }
            >
              <SelectTrigger
                className="w-full"
                aria-label={`${t("suppressions.form.operatorLabel")} ${index + 1}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {operatorItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Input
              value={label.value}
              placeholder="prod"
              aria-label={`${t("suppressions.form.labelValueLabel")} ${index + 1}`}
              onChange={(event) =>
                onChange(replaceAt(values, index, { ...label, value: event.currentTarget.value }))
              }
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`${t("suppressions.form.removeCondition")}: ${t("suppressions.form.labelsLabel")} ${index + 1}`}
              onClick={() => onChange(removeAt(values, index))}
            >
              {t("suppressions.form.removeCondition")}
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="w-fit"
        aria-label={`${t("suppressions.form.addCondition")}: ${t("suppressions.form.labelsLabel")}`}
        onClick={() => onChange([...values, { key: "", operator: "equals", value: "" }])}
      >
        <RiAddLine data-icon="inline-start" aria-hidden />
        {t("suppressions.form.addCondition")}
      </Button>
      <FieldDescription>{t("suppressions.form.labelsDescription")}</FieldDescription>
    </UiField>
  );
}

function replaceAt<T>(values: T[], index: number, next: T): T[] {
  return values.map((value, currentIndex) => (currentIndex === index ? next : value));
}

function removeAt<T>(values: T[], index: number): T[] {
  return values.filter((_, currentIndex) => currentIndex !== index);
}
