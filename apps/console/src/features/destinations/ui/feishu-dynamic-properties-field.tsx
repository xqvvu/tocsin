import { RiMagicLine } from "@remixicon/react";

import type { AlertStatus } from "@tocsin/core";
import type { TemplateBindingSelector } from "@tocsin/destinations";
import { FeishuCardColors, type FeishuCardColor } from "@tocsin/destinations/feishu/appearance";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "#/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { useTranslations } from "#/i18n/use-i18n";

export const BindingSelectorCases = {
  "event.status": ["firing", "resolved", "unknown"],
  "event.severity": ["critical", "warning", "info", "unknown"],
  "source.provider": ["generic", "signoz", "grafana", "uptime_kuma", "alertmanager", "fastgpt"],
  "destination.kind": ["generic_webhook", "feishu", "slack", "email"],
} as const satisfies Record<TemplateBindingSelector, readonly string[]>;

const DefaultSelectorColors: Record<TemplateBindingSelector, Record<string, FeishuCardColor>> = {
  "event.status": {
    firing: "red",
    resolved: "green",
    unknown: "grey",
  },
  "event.severity": {
    critical: "red",
    warning: "orange",
    info: "blue",
    unknown: "grey",
  },
  "source.provider": {
    generic: "grey",
    signoz: "purple",
    grafana: "orange",
    uptime_kuma: "green",
    alertmanager: "red",
    fastgpt: "blue",
  },
  "destination.kind": {
    generic_webhook: "grey",
    feishu: "blue",
    slack: "purple",
    email: "turquoise",
  },
};

const FeishuColorHex: Record<FeishuCardColor, string> = {
  blue: "#3370ff",
  wathet: "#3ec3e0",
  turquoise: "#00b8a9",
  green: "#34a853",
  yellow: "#f5c451",
  orange: "#f59e0b",
  red: "#d93025",
  carmine: "#c2185b",
  violet: "#7c4dff",
  purple: "#7b61ff",
  indigo: "#4f46e5",
  grey: "#8a8f98",
  default: "#6b7280",
};

const SelectorItems = [
  { value: "event.status", labelKey: "destinations.form.dynamic.selector.status" },
  { value: "event.severity", labelKey: "destinations.form.dynamic.selector.severity" },
  { value: "source.provider", labelKey: "destinations.form.dynamic.selector.provider" },
  { value: "destination.kind", labelKey: "destinations.form.dynamic.selector.destinationKind" },
] as const;

const PreviewStatuses: AlertStatus[] = ["firing", "resolved", "unknown"];

export function FeishuDynamicPropertiesField({
  enabled,
  canApply,
  selector,
  cases,
  fallback,
  previewStatus,
  onApply,
  onSelectorChange,
  onCaseChange,
  onFallbackChange,
  onPreviewStatusChange,
}: {
  enabled: boolean;
  canApply: boolean;
  selector: TemplateBindingSelector;
  cases: Record<string, string>;
  fallback: string;
  previewStatus: AlertStatus;
  onApply: () => void;
  onSelectorChange: (selector: TemplateBindingSelector, cases: Record<string, string>) => void;
  onCaseChange: (caseName: string, color: FeishuCardColor) => void;
  onFallbackChange: (color: FeishuCardColor) => void;
  onPreviewStatusChange: (status: AlertStatus) => void;
}) {
  const t = useTranslations();

  if (!enabled) {
    return (
      <Alert>
        <AlertTitle>{t("destinations.form.dynamic.compatibilityTitle")}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          <span>{t("destinations.form.dynamic.compatibilityDescription")}</span>
          <Button type="button" variant="outline" size="xs" disabled={!canApply} onClick={onApply}>
            <RiMagicLine data-icon="inline-start" aria-hidden />
            {t("destinations.form.dynamic.applyStatusColors")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const selectorItems = SelectorItems.map((item) => ({
    value: item.value,
    label: t(item.labelKey),
  }));
  const caseNames = BindingSelectorCases[selector];

  return (
    <FieldSet className="gap-2">
      <FieldLegend variant="label">{t("destinations.form.dynamic.title")}</FieldLegend>
      <FieldDescription>{t("destinations.form.dynamic.description")}</FieldDescription>
      <FieldGroup className="gap-2">
        <Field orientation="horizontal">
          <FieldLabel htmlFor="template-color-selector">
            {t("destinations.form.dynamic.selectorLabel")}
          </FieldLabel>
          <Select
            id="template-color-selector"
            items={selectorItems}
            value={selector}
            onValueChange={(value) => {
              if (value) {
                const nextSelector = value as TemplateBindingSelector;
                onSelectorChange(nextSelector, defaultColorsForSelector(nextSelector));
              }
            }}
          >
            <SelectTrigger size="sm" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {SelectorItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {t(item.labelKey)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        {caseNames.map((caseName) => (
          <Field key={caseName} orientation="horizontal">
            <FieldLabel>{bindingCaseLabel(t, selector, caseName)}</FieldLabel>
            <FeishuColorSelect
              ariaLabel={t("destinations.form.dynamic.caseColorLabel", {
                caseName: bindingCaseLabel(t, selector, caseName),
              })}
              value={feishuColor(cases[caseName])}
              onChange={(value) => onCaseChange(caseName, value)}
            />
          </Field>
        ))}
        <Field orientation="horizontal">
          <FieldLabel>{t("destinations.form.dynamic.fallback")}</FieldLabel>
          <FeishuColorSelect
            ariaLabel={t("destinations.form.dynamic.fallbackColorLabel")}
            value={feishuColor(fallback)}
            onChange={onFallbackChange}
          />
        </Field>
        <Field>
          <FieldLabel>{t("destinations.form.dynamic.previewStatus")}</FieldLabel>
          <ToggleGroup
            value={[previewStatus]}
            variant="outline"
            size="sm"
            onValueChange={(values) => {
              const status = values[0] as AlertStatus | undefined;

              if (status) {
                onPreviewStatusChange(status);
              }
            }}
          >
            {PreviewStatuses.map((status) => (
              <ToggleGroupItem key={status} value={status} aria-label={alertStatusLabel(t, status)}>
                {alertStatusLabel(t, status)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <FieldDescription>
            {t("destinations.form.dynamic.previewStatusDescription")}
          </FieldDescription>
        </Field>
      </FieldGroup>
    </FieldSet>
  );
}

function FeishuColorSelect({
  ariaLabel,
  value,
  onChange,
}: {
  ariaLabel: string;
  value: FeishuCardColor;
  onChange: (value: FeishuCardColor) => void;
}) {
  const items = FeishuCardColors.map((color) => ({ value: color, label: color }));

  return (
    <Select
      items={items}
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue) {
          onChange(nextValue as FeishuCardColor);
        }
      }}
    >
      <SelectTrigger size="sm" className="w-36" aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {FeishuCardColors.map((color) => (
            <SelectItem key={color} value={color}>
              <ColorSwatch color={color} />
              <span className="font-mono">{color}</span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function ColorSwatch({ color }: { color: FeishuCardColor }) {
  return (
    <span
      className="border-foreground/15 size-3 shrink-0 border"
      style={{ backgroundColor: FeishuColorHex[color] }}
      aria-hidden
    />
  );
}

export function defaultColorsForSelector(
  selector: TemplateBindingSelector,
): Record<string, string> {
  return { ...DefaultSelectorColors[selector] };
}

function feishuColor(value: string | undefined): FeishuCardColor {
  return FeishuCardColors.includes(value as FeishuCardColor) ? (value as FeishuCardColor) : "grey";
}

function alertStatusLabel(t: ReturnType<typeof useTranslations>, status: AlertStatus): string {
  return t(`common.alertStatus.${status}`);
}

function bindingCaseLabel(
  t: ReturnType<typeof useTranslations>,
  selector: TemplateBindingSelector,
  value: string,
): string {
  if (selector === "event.status") {
    return t(`common.alertStatus.${value as AlertStatus}`);
  }

  if (selector === "event.severity") {
    return t(`common.severity.${value as "critical" | "warning" | "info" | "unknown"}`);
  }

  if (selector === "source.provider") {
    return t(`sources.providers.${value}`);
  }

  return t(`destinations.kinds.${value}`);
}
