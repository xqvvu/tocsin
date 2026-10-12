import { RiCloseLine, RiFilter3Line, RiSearchLine } from "@remixicon/react";

import type { DestinationSummary, SourceSummary } from "@tocsin/core";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Field as UiField, FieldGroup, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "#/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import type { DashboardOperationSearch } from "#/features/operations/model/operation-search";
import { useTranslations } from "#/i18n/use-i18n";
import { cn } from "#/lib/utils";

type TranslationFn = ReturnType<typeof useTranslations>;

export function OperationFilters({
  configuration,
  search,
  pending,
  onChange,
  layout = "toolbar",
}: {
  configuration: {
    sources: SourceSummary[];
    destinations: DestinationSummary[];
  };
  search: DashboardOperationSearch;
  pending: boolean;
  onChange: (next: Partial<DashboardOperationSearch>) => void;
  /** @deprecated Prefer toolbar; rail is kept for transitional layouts. */
  layout?: "grid" | "rail" | "toolbar";
}) {
  const t = useTranslations();
  const chips = activeFilterChips(search, configuration, t);
  const activeCount = chips.length;
  const resolvedLayout = layout === "grid" ? "toolbar" : layout;

  if (resolvedLayout === "rail") {
    return (
      <OperationFiltersPanel
        configuration={configuration}
        search={search}
        pending={pending}
        onChange={onChange}
        className="border-border bg-background border p-2"
      />
    );
  }

  return (
    <div className="border-border bg-background flex flex-col gap-2 border p-2">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <RiSearchLine
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
          />
          <Input
            id="operation-search"
            value={search.q ?? ""}
            disabled={pending}
            placeholder={t("operations.filters.searchPlaceholder")}
            className="h-8 pl-7"
            onChange={(event) => onChange({ q: event.currentTarget.value })}
            aria-label={t("operations.filters.search")}
          />
        </div>

        <Popover>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                className="shrink-0"
              />
            }
          >
            <RiFilter3Line data-icon="inline-start" aria-hidden />
            {t("operations.filters.panelTitle")}
            {activeCount > 0 ? (
              <Badge variant="secondary" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
                {activeCount}
              </Badge>
            ) : null}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-3">
            <PopoverHeader className="mb-1">
              <PopoverTitle>{t("operations.filters.panelTitle")}</PopoverTitle>
              <PopoverDescription>{t("operations.filters.panelDescription")}</PopoverDescription>
            </PopoverHeader>
            <OperationFiltersPanel
              configuration={configuration}
              search={search}
              pending={pending}
              onChange={onChange}
              compact
            />
          </PopoverContent>
        </Popover>
      </div>

      {chips.length > 0 ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              disabled={pending}
              onClick={() => onChange(chip.clear)}
              className={cn(
                "border-border bg-muted/50 text-foreground hover:bg-muted inline-flex h-6 max-w-full items-center gap-1 border px-1.5 text-[11px]",
                pending ? "pointer-events-none opacity-60" : null,
              )}
              title={t("operations.filters.clearChip", { label: chip.label })}
            >
              <span className="text-muted-foreground shrink-0">{chip.label}</span>
              <span className="min-w-0 truncate font-medium">{chip.valueLabel}</span>
              <RiCloseLine aria-hidden className="size-3 shrink-0 opacity-70" />
            </button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={pending}
            className="h-6 px-1.5 text-[11px]"
            onClick={() =>
              onChange({
                sourceId: "",
                severity: "",
                status: "",
                destinationId: "",
                deliveryState: "",
                q: "",
              })
            }
          >
            {t("common.actions.resetFilters")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function OperationFiltersPanel({
  configuration,
  search,
  pending,
  onChange,
  compact = false,
  className,
}: {
  configuration: {
    sources: SourceSummary[];
    destinations: DestinationSummary[];
  };
  search: DashboardOperationSearch;
  pending: boolean;
  onChange: (next: Partial<DashboardOperationSearch>) => void;
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations();
  const sourceItems = [
    { value: null, label: t("operations.filters.anySource") },
    ...configuration.sources.map((source) => ({ value: source.id, label: source.name })),
  ];
  const destinationItems = [
    { value: null, label: t("operations.filters.anyDestination") },
    ...configuration.destinations.map((destination) => ({
      value: destination.id,
      label: destination.name,
    })),
  ];

  return (
    <FieldGroup
      className={cn(
        "grid gap-2",
        compact ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1",
        className,
      )}
    >
      <UiField>
        <FieldLabel htmlFor="operation-source">{t("operations.filters.source")}</FieldLabel>
        <Select
          id="operation-source"
          items={sourceItems}
          value={search.sourceId || null}
          disabled={pending}
          onValueChange={(value) => onChange({ sourceId: value ?? "" })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("operations.filters.anySource")} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={null}>{t("operations.filters.anySource")}</SelectItem>
              {configuration.sources.map((source) => (
                <SelectItem key={source.id} value={source.id}>
                  {source.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </UiField>
      <UiField>
        <FieldLabel htmlFor="operation-severity">{t("operations.filters.severity")}</FieldLabel>
        <Select
          id="operation-severity"
          items={[
            { value: null, label: t("common.severity.any") },
            { value: "critical", label: t("common.severity.critical") },
            { value: "warning", label: t("common.severity.warning") },
            { value: "info", label: t("common.severity.info") },
            { value: "unknown", label: t("common.severity.unknown") },
          ]}
          value={search.severity || null}
          disabled={pending}
          onValueChange={(value) =>
            onChange({
              severity: (value ?? "") as DashboardOperationSearch["severity"],
            })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("common.severity.any")} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={null}>{t("common.severity.any")}</SelectItem>
              <SelectItem value="critical">{t("common.severity.critical")}</SelectItem>
              <SelectItem value="warning">{t("common.severity.warning")}</SelectItem>
              <SelectItem value="info">{t("common.severity.info")}</SelectItem>
              <SelectItem value="unknown">{t("common.severity.unknown")}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </UiField>
      <UiField>
        <FieldLabel htmlFor="operation-status">{t("operations.filters.status")}</FieldLabel>
        <Select
          id="operation-status"
          items={[
            { value: null, label: t("common.alertStatus.any") },
            { value: "firing", label: t("common.alertStatus.firing") },
            { value: "resolved", label: t("common.alertStatus.resolved") },
            { value: "unknown", label: t("common.alertStatus.unknown") },
          ]}
          value={search.status || null}
          disabled={pending}
          onValueChange={(value) =>
            onChange({ status: (value ?? "") as DashboardOperationSearch["status"] })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("common.alertStatus.any")} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={null}>{t("common.alertStatus.any")}</SelectItem>
              <SelectItem value="firing">{t("common.alertStatus.firing")}</SelectItem>
              <SelectItem value="resolved">{t("common.alertStatus.resolved")}</SelectItem>
              <SelectItem value="unknown">{t("common.alertStatus.unknown")}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </UiField>
      <UiField>
        <FieldLabel htmlFor="operation-destination">
          {t("operations.filters.destination")}
        </FieldLabel>
        <Select
          id="operation-destination"
          items={destinationItems}
          value={search.destinationId || null}
          disabled={pending}
          onValueChange={(value) => onChange({ destinationId: value ?? "" })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("operations.filters.anyDestination")} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={null}>{t("operations.filters.anyDestination")}</SelectItem>
              {configuration.destinations.map((destination) => (
                <SelectItem key={destination.id} value={destination.id}>
                  {destination.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </UiField>
      <UiField className={compact ? "sm:col-span-2" : undefined}>
        <FieldLabel htmlFor="operation-delivery-state">
          {t("operations.filters.deliveryState")}
        </FieldLabel>
        <Select
          id="operation-delivery-state"
          items={[
            { value: null, label: t("common.deliveryState.any") },
            { value: "pending", label: t("common.deliveryState.pending") },
            { value: "running", label: t("common.deliveryState.running") },
            { value: "succeeded", label: t("common.deliveryState.succeeded") },
            { value: "failed", label: t("common.deliveryState.failed") },
            { value: "suppressed", label: t("common.deliveryState.suppressed") },
          ]}
          value={search.deliveryState || null}
          disabled={pending}
          onValueChange={(value) =>
            onChange({
              deliveryState: (value ?? "") as DashboardOperationSearch["deliveryState"],
            })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("common.deliveryState.any")} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={null}>{t("common.deliveryState.any")}</SelectItem>
              <SelectItem value="pending">{t("common.deliveryState.pending")}</SelectItem>
              <SelectItem value="running">{t("common.deliveryState.running")}</SelectItem>
              <SelectItem value="succeeded">{t("common.deliveryState.succeeded")}</SelectItem>
              <SelectItem value="failed">{t("common.deliveryState.failed")}</SelectItem>
              <SelectItem value="suppressed">{t("common.deliveryState.suppressed")}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </UiField>
    </FieldGroup>
  );
}

interface ActiveFilterChip {
  key: string;
  label: string;
  valueLabel: string;
  clear: Partial<DashboardOperationSearch>;
}

function activeFilterChips(
  search: DashboardOperationSearch,
  configuration: {
    sources: SourceSummary[];
    destinations: DestinationSummary[];
  },
  t: TranslationFn,
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];

  if (search.q?.trim()) {
    chips.push({
      key: "q",
      label: t("operations.filters.search"),
      valueLabel: search.q.trim(),
      clear: { q: "" },
    });
  }

  if (search.sourceId) {
    const source = configuration.sources.find((item) => item.id === search.sourceId);
    chips.push({
      key: "sourceId",
      label: t("operations.filters.source"),
      valueLabel: source?.name ?? search.sourceId,
      clear: { sourceId: "" },
    });
  }

  if (search.severity) {
    chips.push({
      key: "severity",
      label: t("operations.filters.severity"),
      valueLabel: t(`common.severity.${search.severity}`),
      clear: { severity: "" },
    });
  }

  if (search.status) {
    chips.push({
      key: "status",
      label: t("operations.filters.status"),
      valueLabel: t(`common.alertStatus.${search.status}`),
      clear: { status: "" },
    });
  }

  if (search.destinationId) {
    const destination = configuration.destinations.find((item) => item.id === search.destinationId);
    chips.push({
      key: "destinationId",
      label: t("operations.filters.destination"),
      valueLabel: destination?.name ?? search.destinationId,
      clear: { destinationId: "" },
    });
  }

  if (search.deliveryState) {
    chips.push({
      key: "deliveryState",
      label: t("operations.filters.deliveryState"),
      valueLabel: t(`common.deliveryState.${search.deliveryState}`),
      clear: { deliveryState: "" },
    });
  }

  return chips;
}
