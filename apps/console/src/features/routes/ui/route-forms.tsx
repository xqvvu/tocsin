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
  createEmptyLabelCondition,
  isIncompleteLabelCondition,
  routeFormDefaultsFromRule,
  routeRuleFromValues,
  type RouteLabelCondition,
  type RouteRuleFormValues,
  type RouteSeverityCondition,
  type RouteStatusCondition,
} from "#/features/routes/model/route-form";
import { RouteEditRestrictedNotice } from "#/features/routes/ui/route-edit-restricted-notice";
import { useTranslations } from "#/i18n/use-i18n";
import { cn } from "#/lib/utils";

const routeSeverityValues: RouteSeverityCondition[] = ["critical", "warning", "info", "unknown"];
const routeStatusValues: RouteStatusCondition[] = ["firing", "resolved", "unknown"];

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
          sourceIds: [],
          severities: ["critical"],
          statuses: [],
          labels: [],
          titleContains: [],
          messageContains: [],
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
      <RouteEditRestrictedNotice rule={route.rule} sources={sources} />
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
            rule: routeRuleFromValues(values.rule),
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

  const routeSeverityItems = routeSeverityValues.map((severity) => ({
    value: severity,
    label: t(`common.severity.${severity}`),
  }));
  const routeStatusItems = routeStatusValues.map((status) => ({
    value: status,
    label: t(`common.alertStatus.${status}`),
  }));
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
      <form.Field name="rule.sourceIds">
        {(field) => {
          const selectedSourceIds = field.state.value;
          const nextSourceId = sources.find((source) => !selectedSourceIds.includes(source.id))?.id;
          // Stored ids that the source list no longer contains stay selectable so
          // they remain visible, editable into a live source, and never dropped.
          const sourceItems = [
            ...sources.map((source) => ({ value: source.id, label: source.name })),
            ...selectedSourceIds
              .filter((sourceId) => !sources.some((source) => source.id === sourceId))
              .map((sourceId) => ({
                value: sourceId,
                label: `${sourceId} (${t("routing.form.sourceMissing")})`,
              })),
          ];

          return (
            <ConditionList
              label={t("routing.form.sourceLabel")}
              description={t("routing.form.sourceDescription")}
              addDisabled={nextSourceId === undefined}
              onAdd={() => {
                if (nextSourceId !== undefined) {
                  field.handleChange([...selectedSourceIds, nextSourceId]);
                }
              }}
            >
              {selectedSourceIds.map((sourceId, index) => (
                <ConditionRow
                  key={index}
                  label={t("routing.form.sourceLabel")}
                  index={index}
                  onRemove={() => field.handleChange(removeConditionAt(selectedSourceIds, index))}
                >
                  <Select
                    id={`${field.name}-${index}`}
                    name={`${field.name}-${index}`}
                    items={sourceItems}
                    disabled={sources.length === 0}
                    value={sourceId}
                    onValueChange={(value) =>
                      field.handleChange(replaceConditionAt(selectedSourceIds, index, value ?? ""))
                    }
                  >
                    <SelectTrigger
                      className="w-full"
                      onBlur={field.handleBlur}
                      aria-label={`${t("routing.form.sourceLabel")} ${index + 1}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {sourceItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </ConditionRow>
              ))}
            </ConditionList>
          );
        }}
      </form.Field>
      <form.Field name="rule.severities">
        {(field) => {
          const selectedSeverities = field.state.value;
          const nextSeverity = routeSeverityValues.find(
            (severity) => !selectedSeverities.includes(severity),
          );

          return (
            <ConditionList
              label={t("routing.form.severityLabel")}
              description={t("routing.form.severityDescription")}
              addDisabled={nextSeverity === undefined}
              onAdd={() => {
                if (nextSeverity !== undefined) {
                  field.handleChange([...selectedSeverities, nextSeverity]);
                }
              }}
            >
              {selectedSeverities.map((severity, index) => (
                <ConditionRow
                  key={index}
                  label={t("routing.form.severityLabel")}
                  index={index}
                  onRemove={() => field.handleChange(removeConditionAt(selectedSeverities, index))}
                >
                  <Select
                    id={`${field.name}-${index}`}
                    name={`${field.name}-${index}`}
                    items={routeSeverityItems}
                    value={severity}
                    onValueChange={(value) =>
                      field.handleChange(
                        replaceConditionAt(
                          selectedSeverities,
                          index,
                          value as RouteSeverityCondition,
                        ),
                      )
                    }
                  >
                    <SelectTrigger
                      className="w-full"
                      onBlur={field.handleBlur}
                      aria-label={`${t("routing.form.severityLabel")} ${index + 1}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {routeSeverityItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </ConditionRow>
              ))}
            </ConditionList>
          );
        }}
      </form.Field>
      <form.Field name="rule.statuses">
        {(field) => {
          const selectedStatuses = field.state.value;
          const nextStatus = routeStatusValues.find((status) => !selectedStatuses.includes(status));

          return (
            <ConditionList
              label={t("routing.form.statusLabel")}
              description={t("routing.form.statusDescription")}
              addDisabled={nextStatus === undefined}
              onAdd={() => {
                if (nextStatus !== undefined) {
                  field.handleChange([...selectedStatuses, nextStatus]);
                }
              }}
            >
              {selectedStatuses.map((status, index) => (
                <ConditionRow
                  key={index}
                  label={t("routing.form.statusLabel")}
                  index={index}
                  onRemove={() => field.handleChange(removeConditionAt(selectedStatuses, index))}
                >
                  <Select
                    id={`${field.name}-${index}`}
                    name={`${field.name}-${index}`}
                    items={routeStatusItems}
                    value={status}
                    onValueChange={(value) =>
                      field.handleChange(
                        replaceConditionAt(selectedStatuses, index, value as RouteStatusCondition),
                      )
                    }
                  >
                    <SelectTrigger
                      className="w-full"
                      onBlur={field.handleBlur}
                      aria-label={`${t("routing.form.statusLabel")} ${index + 1}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {routeStatusItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </ConditionRow>
              ))}
            </ConditionList>
          );
        }}
      </form.Field>
      <form.Field
        name="rule.labels"
        validators={{
          onSubmit: ({ value }) =>
            value.some((condition) => isIncompleteLabelCondition(condition))
              ? t("routing.form.validation.labelConditionIncomplete")
              : undefined,
        }}
      >
        {(field) => (
          <ConditionList
            label={t("routing.form.labelsLabel")}
            description={t("routing.form.labelsDescription")}
            addDisabled={false}
            onAdd={() => field.handleChange([...field.state.value, createEmptyLabelCondition()])}
          >
            {field.state.value.map((condition, index) => (
              <ConditionRow
                key={index}
                label={t("routing.form.labelsLabel")}
                index={index}
                onRemove={() => field.handleChange(removeConditionAt(field.state.value, index))}
              >
                <div className="grid w-full gap-1 sm:grid-cols-[minmax(0,1fr)_116px_minmax(0,1fr)]">
                  <Input
                    id={`${field.name}-key-${index}`}
                    name={`${field.name}-key-${index}`}
                    placeholder="service"
                    aria-label={`${t("routing.form.labelKeyLabel")} ${index + 1}`}
                    value={condition.key}
                    onBlur={field.handleBlur}
                    onChange={(event) =>
                      field.handleChange(
                        replaceConditionAt(field.state.value, index, {
                          ...condition,
                          key: event.currentTarget.value,
                        }),
                      )
                    }
                  />
                  <Select
                    id={`${field.name}-operator-${index}`}
                    name={`${field.name}-operator-${index}`}
                    items={labelOperatorItems}
                    value={condition.operator}
                    onValueChange={(value) =>
                      field.handleChange(
                        replaceConditionAt(field.state.value, index, {
                          ...condition,
                          operator: value as RouteLabelCondition["operator"],
                        }),
                      )
                    }
                  >
                    <SelectTrigger
                      className="w-full"
                      onBlur={field.handleBlur}
                      aria-label={`${t("routing.form.operatorLabel")} ${index + 1}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {labelOperatorItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Input
                    id={`${field.name}-value-${index}`}
                    name={`${field.name}-value-${index}`}
                    placeholder="checkout"
                    aria-label={`${t("routing.form.labelValueLabel")} ${index + 1}`}
                    value={condition.value}
                    onBlur={field.handleBlur}
                    onChange={(event) =>
                      field.handleChange(
                        replaceConditionAt(field.state.value, index, {
                          ...condition,
                          value: event.currentTarget.value,
                        }),
                      )
                    }
                  />
                </div>
              </ConditionRow>
            ))}
            <FieldError
              errors={field.state.meta.errors.map((error) => ({
                message: String(error),
              }))}
            />
          </ConditionList>
        )}
      </form.Field>
      <form.Field name="rule.titleContains">
        {(field) => (
          <ConditionList
            label={t("routing.form.titleContainsLabel")}
            description={t("routing.form.titleContainsDescription")}
            addDisabled={false}
            onAdd={() => field.handleChange([...field.state.value, ""])}
          >
            {field.state.value.map((value, index) => (
              <ConditionRow
                key={index}
                label={t("routing.form.titleContainsLabel")}
                index={index}
                onRemove={() => field.handleChange(removeConditionAt(field.state.value, index))}
              >
                <Input
                  id={`${field.name}-${index}`}
                  name={`${field.name}-${index}`}
                  placeholder="LatencyHigh"
                  aria-label={`${t("routing.form.titleContainsLabel")} ${index + 1}`}
                  value={value}
                  onBlur={field.handleBlur}
                  onChange={(event) =>
                    field.handleChange(
                      replaceConditionAt(field.state.value, index, event.currentTarget.value),
                    )
                  }
                />
              </ConditionRow>
            ))}
          </ConditionList>
        )}
      </form.Field>
      <form.Field name="rule.messageContains">
        {(field) => (
          <ConditionList
            label={t("routing.form.messageContainsLabel")}
            description={t("routing.form.messageContainsDescription")}
            addDisabled={false}
            onAdd={() => field.handleChange([...field.state.value, ""])}
          >
            {field.state.value.map((value, index) => (
              <ConditionRow
                key={index}
                label={t("routing.form.messageContainsLabel")}
                index={index}
                onRemove={() => field.handleChange(removeConditionAt(field.state.value, index))}
              >
                <Input
                  id={`${field.name}-${index}`}
                  name={`${field.name}-${index}`}
                  placeholder="timeout"
                  aria-label={`${t("routing.form.messageContainsLabel")} ${index + 1}`}
                  value={value}
                  onBlur={field.handleBlur}
                  onChange={(event) =>
                    field.handleChange(
                      replaceConditionAt(field.state.value, index, event.currentTarget.value),
                    )
                  }
                />
              </ConditionRow>
            ))}
          </ConditionList>
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

/** One repeatable condition class: its rows, an add button, and its help text. */
function ConditionList({
  label,
  description,
  addDisabled,
  onAdd,
  children,
}: {
  label: string;
  description: string;
  addDisabled: boolean;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations();

  return (
    <UiField>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex w-full flex-col gap-1">{children}</div>
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="w-fit"
        disabled={addDisabled}
        aria-label={`${t("routing.form.addCondition")}: ${label}`}
        onClick={onAdd}
      >
        <RiAddLine data-icon="inline-start" aria-hidden />
        {t("routing.form.addCondition")}
      </Button>
      <FieldDescription>{description}</FieldDescription>
    </UiField>
  );
}

/** A single condition entry with its own remove affordance. */
function ConditionRow({
  label,
  index,
  onRemove,
  children,
}: {
  label: string;
  index: number;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations();

  return (
    <div className="flex w-full items-start gap-1">
      <div className="min-w-0 flex-1">{children}</div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-muted-foreground shrink-0"
        aria-label={`${t("routing.form.removeCondition")}: ${label} ${index + 1}`}
        onClick={onRemove}
      >
        <RiCloseLine aria-hidden />
      </Button>
    </div>
  );
}

function replaceConditionAt<T>(values: T[], index: number, next: T): T[] {
  return values.map((value, currentIndex) => (currentIndex === index ? next : value));
}

function removeConditionAt<T>(values: T[], index: number): T[] {
  return values.filter((_, currentIndex) => currentIndex !== index);
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
