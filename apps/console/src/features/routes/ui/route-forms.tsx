import {
  RiAddLine,
  RiArrowDownSLine,
  RiCloseLine,
  RiEditLine,
  RiGitBranchLine,
} from "@remixicon/react";
import { useForm } from "@tanstack/react-form";
import * as React from "react";

import type { DestinationSummary, RouteDefinition, SourceSummary } from "@tocsin/core";

import { FormPanel } from "#/components/common/content-panel";
import { Badge } from "#/components/ui/badge";
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
  routeFormDefaultsFromRule,
  routeRuleFromValues,
  routeRulePatchFromValues,
  type RouteRuleFormValues,
} from "#/features/routes/model/route-form";
import { RouteEditRestrictedNotice } from "#/features/routes/ui/route-edit-restricted-notice";
import { useTranslations } from "#/i18n/use-i18n";
import { cn } from "#/lib/utils";

export function CreateRouteForm({
  showHeader = true,
  sources,
  destinations,
  layout = "panel",
  pending,
  onSubmit,
}: {
  showHeader?: boolean;
  sources: SourceSummary[];
  destinations: DestinationSummary[];
  layout?: "dialog" | "panel";
  pending: boolean;
  onSubmit: (input: {
    name: string;
    rule: RouteDefinition["rule"];
    destinationIds: string[];
  }) => void;
}) {
  const t = useTranslations();
  const form = (
    <RouteForm
      sources={sources}
      destinations={destinations}
      layout={layout}
      pending={pending}
      defaultValues={{
        name: "",
        rule: {
          sourceId: "",
          severity: "critical",
          status: "any",
          labelKey: "",
          labelOperator: "equals",
          labelValue: "",
          titleContains: "",
          messageContains: "",
        },
        destinationIds: [],
      }}
      submitLabel={t("routing.form.create.submit")}
      submitIcon={<RiAddLine data-icon="inline-start" aria-hidden />}
      resetOnSubmit
      onSubmit={(values) => {
        onSubmit({
          name: values.name.trim(),
          rule: routeRuleFromValues(values.rule),
          destinationIds: values.destinationIds,
        });
      }}
    />
  );

  if (!showHeader) {
    return form;
  }

  return (
    <FormPanel
      title={t("routing.form.create.title")}
      icon={<RiGitBranchLine className="size-4" aria-hidden />}
    >
      <p className="text-muted-foreground mb-3 text-xs">{t("routing.form.create.description")}</p>
      {form}
    </FormPanel>
  );
}

export function EditRouteForm({
  route,
  sources,
  destinations,
  pending,
  onCancel,
  onSubmit,
}: {
  route: RouteDefinition;
  sources: SourceSummary[];
  destinations: DestinationSummary[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: {
    id: string;
    name: string;
    rule: RouteDefinition["rule"];
    destinationIds: string[];
  }) => void;
}) {
  const t = useTranslations();

  return (
    <section className="border-border bg-muted/30 mt-3 border p-3">
      <h3 className="flex items-center gap-2 text-xs font-semibold">
        <RiEditLine className="size-3.5" aria-hidden />
        {t("routing.form.edit.title")}
      </h3>
      <p className="text-muted-foreground mt-1 mb-3 text-xs">
        {t("routing.form.edit.description")}
      </p>
      <RouteEditRestrictedNotice rule={route.rule} />
      <RouteForm
        sources={sources}
        destinations={destinations}
        pending={pending}
        defaultValues={{
          name: route.name,
          rule: routeFormDefaultsFromRule(route.rule),
          destinationIds: route.destinationIds,
        }}
        submitLabel={t("routing.form.edit.submit")}
        submitIcon={<RiEditLine data-icon="inline-start" aria-hidden />}
        onSubmit={(values) =>
          onSubmit({
            id: route.id,
            name: values.name.trim(),
            rule: routeRulePatchFromValues(route.rule, values.rule),
            destinationIds: values.destinationIds,
          })
        }
        onCancel={onCancel}
      />
    </section>
  );
}

type RouteFormValues = {
  name: string;
  rule: RouteRuleFormValues;
  destinationIds: string[];
};

function RouteForm({
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
  destinations: DestinationSummary[];
  layout?: "dialog" | "panel";
  pending: boolean;
  defaultValues: RouteFormValues;
  submitLabel: string;
  submitIcon: React.ReactNode;
  resetOnSubmit?: boolean;
  onSubmit: (values: RouteFormValues) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations();
  const isDialogLayout = layout === "dialog";

  const sourceItems = [
    { value: null, label: t("routing.form.anySource") },
    ...sources.map((source) => ({ value: source.id, label: source.name })),
  ];
  const routeSeverityItems = [
    { value: "any", label: t("routing.form.severityAny") },
    { value: "critical", label: t("common.severity.critical") },
    { value: "warning", label: t("common.severity.warning") },
    { value: "info", label: t("common.severity.info") },
    { value: "unknown", label: t("common.severity.unknown") },
  ];
  const routeStatusItems = [
    { value: "any", label: t("routing.form.statusAny") },
    { value: "firing", label: t("common.alertStatus.firing") },
    { value: "resolved", label: t("common.alertStatus.resolved") },
    { value: "unknown", label: t("common.alertStatus.unknown") },
  ];
  const labelOperatorItems = [
    { value: "equals", label: t("routing.form.operatorEquals") },
    { value: "contains", label: t("routing.form.operatorContains") },
  ];
  const form = useForm({
    defaultValues,
    onSubmit: ({ value }) => {
      onSubmit(value);

      if (resetOnSubmit) {
        form.reset();
      }
    },
  });

  const fields = (
    <FieldGroup className={isDialogLayout ? "gap-3" : "gap-2"}>
      <form.Field
        name="name"
        validators={{
          onSubmit: ({ value }) =>
            value.trim().length === 0 ? t("routing.form.validation.nameRequired") : undefined,
        }}
      >
        {(field) => (
          <UiField data-invalid={field.state.meta.errors.length > 0}>
            <FieldLabel htmlFor={field.name}>{t("routing.form.nameLabel")}</FieldLabel>
            <Input
              id={field.name}
              name={field.name}
              placeholder={t("routing.form.namePlaceholder")}
              value={field.state.value}
              required
              aria-invalid={field.state.meta.errors.length > 0}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.currentTarget.value)}
            />
            <FieldDescription>{t("routing.form.nameDescription")}</FieldDescription>
            <FieldError
              errors={field.state.meta.errors.map((error) => ({
                message: String(error),
              }))}
            />
          </UiField>
        )}
      </form.Field>
      <form.Field name="rule.sourceId">
        {(field) => (
          <UiField data-disabled={sources.length === 0}>
            <FieldLabel htmlFor={field.name}>{t("routing.form.sourceLabel")}</FieldLabel>
            <Select
              id={field.name}
              name={field.name}
              items={sourceItems}
              disabled={sources.length === 0}
              value={field.state.value || null}
              onValueChange={(value) => field.handleChange(value ?? "")}
            >
              <SelectTrigger className="w-full" onBlur={field.handleBlur}>
                <SelectValue placeholder={t("routing.form.anySource")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={null}>{t("routing.form.anySource")}</SelectItem>
                  {sources.map((source) => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>{t("routing.form.sourceDescription")}</FieldDescription>
          </UiField>
        )}
      </form.Field>
      <form.Field name="rule.severity">
        {(field) => (
          <UiField>
            <FieldLabel htmlFor={field.name}>{t("routing.form.severityLabel")}</FieldLabel>
            <Select
              id={field.name}
              name={field.name}
              items={routeSeverityItems}
              value={field.state.value}
              onValueChange={(value) =>
                field.handleChange(value as RouteRuleFormValues["severity"])
              }
            >
              <SelectTrigger className="w-full" onBlur={field.handleBlur}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="any">{t("routing.form.severityAny")}</SelectItem>
                  <SelectItem value="critical">{t("common.severity.critical")}</SelectItem>
                  <SelectItem value="warning">{t("common.severity.warning")}</SelectItem>
                  <SelectItem value="info">{t("common.severity.info")}</SelectItem>
                  <SelectItem value="unknown">{t("common.severity.unknown")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>{t("routing.form.severityDescription")}</FieldDescription>
          </UiField>
        )}
      </form.Field>
      <form.Field name="rule.status">
        {(field) => (
          <UiField>
            <FieldLabel htmlFor={field.name}>{t("routing.form.statusLabel")}</FieldLabel>
            <Select
              id={field.name}
              name={field.name}
              items={routeStatusItems}
              value={field.state.value}
              onValueChange={(value) => field.handleChange(value as RouteRuleFormValues["status"])}
            >
              <SelectTrigger className="w-full" onBlur={field.handleBlur}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="any">{t("routing.form.statusAny")}</SelectItem>
                  <SelectItem value="firing">{t("common.alertStatus.firing")}</SelectItem>
                  <SelectItem value="resolved">{t("common.alertStatus.resolved")}</SelectItem>
                  <SelectItem value="unknown">{t("common.alertStatus.unknown")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>{t("routing.form.statusDescription")}</FieldDescription>
          </UiField>
        )}
      </form.Field>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_116px_minmax(0,1fr)]">
        <form.Field name="rule.labelKey">
          {(field) => (
            <UiField>
              <FieldLabel htmlFor={field.name}>{t("routing.form.labelKeyLabel")}</FieldLabel>
              <Input
                id={field.name}
                name={field.name}
                placeholder="service"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.currentTarget.value)}
              />
              <FieldDescription>{t("routing.form.labelKeyDescription")}</FieldDescription>
            </UiField>
          )}
        </form.Field>
        <form.Field name="rule.labelOperator">
          {(field) => (
            <UiField>
              <FieldLabel htmlFor={field.name}>{t("routing.form.operatorLabel")}</FieldLabel>
              <Select
                id={field.name}
                name={field.name}
                items={labelOperatorItems}
                value={field.state.value}
                onValueChange={(value) =>
                  field.handleChange(value as RouteRuleFormValues["labelOperator"])
                }
              >
                <SelectTrigger className="w-full" onBlur={field.handleBlur}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="equals">{t("routing.form.operatorEquals")}</SelectItem>
                    <SelectItem value="contains">{t("routing.form.operatorContains")}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>{t("routing.form.operatorDescription")}</FieldDescription>
            </UiField>
          )}
        </form.Field>
        <form.Field name="rule.labelValue">
          {(field) => (
            <UiField>
              <FieldLabel htmlFor={field.name}>{t("routing.form.labelValueLabel")}</FieldLabel>
              <Input
                id={field.name}
                name={field.name}
                placeholder="checkout"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.currentTarget.value)}
              />
              <FieldDescription>{t("routing.form.labelValueDescription")}</FieldDescription>
            </UiField>
          )}
        </form.Field>
      </div>
      <form.Field name="rule.titleContains">
        {(field) => (
          <UiField>
            <FieldLabel htmlFor={field.name}>{t("routing.form.titleContainsLabel")}</FieldLabel>
            <Input
              id={field.name}
              name={field.name}
              placeholder="LatencyHigh"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.currentTarget.value)}
            />
            <FieldDescription>{t("routing.form.titleContainsDescription")}</FieldDescription>
          </UiField>
        )}
      </form.Field>
      <form.Field name="rule.messageContains">
        {(field) => (
          <UiField>
            <FieldLabel htmlFor={field.name}>{t("routing.form.messageContainsLabel")}</FieldLabel>
            <Input
              id={field.name}
              name={field.name}
              placeholder="timeout"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.currentTarget.value)}
            />
            <FieldDescription>{t("routing.form.messageContainsDescription")}</FieldDescription>
          </UiField>
        )}
      </form.Field>
      <form.Field name="destinationIds">
        {(field) => (
          <UiField data-disabled={destinations.length === 0}>
            <FieldLabel htmlFor={field.name}>{t("routing.form.destinationsLegend")}</FieldLabel>
            <DestinationMultiSelect
              id={field.name}
              destinations={destinations}
              selectedIds={field.state.value}
              disabled={pending || destinations.length === 0}
              placeholder={t("routing.form.selectDestinationsPlaceholder")}
              emptyLabel={t("routing.form.createDestinationFirst")}
              removeLabel={t("routing.form.removeDestination")}
              selectedCountLabel={(count) => t("routing.form.selectedDestinations", { count })}
              onBlur={field.handleBlur}
              onChange={field.handleChange}
            />
            <FieldDescription>{t("routing.form.destinationsDescription")}</FieldDescription>
          </UiField>
        )}
      </form.Field>
    </FieldGroup>
  );

  return (
    <form
      className={cn("flex flex-col", isDialogLayout ? "min-h-0 flex-1 overflow-hidden" : "gap-2")}
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
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
            {t("routing.form.cancel")}
          </Button>
        ) : null}
        <Button
          type="submit"
          size="sm"
          disabled={pending || destinations.length === 0}
          className={isDialogLayout ? "w-full sm:w-fit" : onCancel ? "" : "w-full"}
        >
          {submitIcon}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function DestinationMultiSelect({
  id,
  destinations,
  selectedIds,
  disabled,
  placeholder,
  emptyLabel,
  removeLabel,
  selectedCountLabel,
  onBlur,
  onChange,
}: {
  id: string;
  destinations: DestinationSummary[];
  selectedIds: string[];
  disabled: boolean;
  placeholder: string;
  emptyLabel: string;
  removeLabel: string;
  selectedCountLabel: (count: number) => string;
  onBlur: () => void;
  onChange: (selectedIds: string[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const selectedDestinations = selectedIds
    .map((destinationId) => destinations.find((destination) => destination.id === destinationId))
    .filter((destination): destination is DestinationSummary => Boolean(destination));

  React.useEffect(() => {
    if (!open) {
      return;
    }

    function closeOnPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        onBlur();
      }
    }

    document.addEventListener("pointerdown", closeOnPointerDown);

    return () => document.removeEventListener("pointerdown", closeOnPointerDown);
  }, [onBlur, open]);

  function toggleDestination(destinationId: string) {
    onChange(
      selectedIds.includes(destinationId)
        ? selectedIds.filter((selectedId) => selectedId !== destinationId)
        : [...selectedIds, destinationId],
    );
  }

  function closeSelect() {
    setOpen(false);
    onBlur();
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          onBlur();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          closeSelect();
        }
      }}
    >
      <div
        data-disabled={disabled}
        className={cn(
          "border-input bg-background text-foreground flex min-h-8 w-full items-center gap-1 border px-1.5 py-1 text-left text-xs transition-colors",
          "focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-text hover:bg-muted/50",
        )}
        onClick={(event) => {
          if (!disabled && event.target === event.currentTarget) {
            setOpen(true);
          }
        }}
      >
        <div
          className="flex max-h-16 min-w-0 flex-1 flex-wrap gap-1 overflow-y-auto py-0.5"
          onClick={() => {
            if (!disabled) {
              setOpen(true);
            }
          }}
        >
          {selectedDestinations.length === 0 ? (
            <span className="text-muted-foreground px-0.5 py-0.5">{placeholder}</span>
          ) : (
            selectedDestinations.map((destination) => (
              <Badge
                key={destination.id}
                variant="outline"
                className="max-w-full gap-1 py-0 pr-0.5 pl-1.5"
              >
                <span className="truncate">{destination.name}</span>
                <span className="text-muted-foreground">{destination.kind}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={disabled}
                  aria-label={`${removeLabel}: ${destination.name}`}
                  className="size-4 border-0 p-0"
                  onClick={(event) => {
                    event.stopPropagation();
                    onChange(selectedIds.filter((selectedId) => selectedId !== destination.id));
                  }}
                >
                  <RiCloseLine aria-hidden />
                </Button>
              </Badge>
            ))
          )}
        </div>
        <Button
          id={id}
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          className="text-muted-foreground h-6 shrink-0 px-1.5"
          onClick={() => {
            setOpen((current) => !current);
          }}
        >
          {selectedDestinations.length > 0 ? (
            <span>{selectedCountLabel(selectedDestinations.length)}</span>
          ) : null}
          <RiArrowDownSLine aria-hidden />
        </Button>
      </div>

      {open ? (
        <div
          id={`${id}-options`}
          role="listbox"
          aria-multiselectable="true"
          className="border-border bg-popover text-popover-foreground absolute top-[calc(100%+4px)] left-0 z-40 max-h-56 w-full overflow-y-auto border shadow-md"
        >
          {destinations.length === 0 ? (
            <div className="text-muted-foreground px-2 py-2 text-xs">{emptyLabel}</div>
          ) : (
            destinations.map((destination) => {
              const checked = selectedIds.includes(destination.id);

              return (
                <div
                  key={destination.id}
                  role="option"
                  aria-selected={checked}
                  tabIndex={0}
                  className="hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground flex cursor-pointer items-start gap-2 px-2 py-2 text-xs outline-none"
                  onClick={() => toggleDestination(destination.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleDestination(destination.id);
                    }
                  }}
                >
                  <Checkbox
                    name={id}
                    value={destination.id}
                    checked={checked}
                    tabIndex={-1}
                    aria-hidden
                    className="pointer-events-none mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{destination.name}</span>
                    <span className="text-muted-foreground block truncate text-[11px]">
                      {destination.kind}
                    </span>
                  </span>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
