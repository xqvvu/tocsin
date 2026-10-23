import { RiCloseLine, RiFilter3Line, RiSearchLine } from "@remixicon/react";
import * as React from "react";

import {
  type DestinationSummary,
  DeliveryStateSchema,
  DestinationKindSchema,
  OPERATION_SEARCH_MAX_LENGTH,
  type RouteDefinition,
  type SourceSummary,
} from "@tocsin/core";

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
import { useOperationDateFormatter } from "#/features/operations/model/operation-format";
import type { DashboardOperationSearch } from "#/features/operations/model/operation-search";
import { useTranslations } from "#/i18n/use-i18n";
import { cn } from "#/lib/utils";

type TranslationFn = ReturnType<typeof useTranslations>;

/**
 * Which page's query backs the toolbar. Event history has no destination,
 * route, or delivery-state dimension, so rendering those controls on Events
 * would silently do nothing.
 */
export type OperationFilterScope = "events" | "deliveries";

export interface OperationFilterConfiguration {
  sources: SourceSummary[];
  destinations: DestinationSummary[];
  /** Route options for the deliveries scope; omitted on events. */
  routes?: RouteDefinition[];
}

export function OperationFilters({
  configuration,
  scope,
  search,
  pending,
  onChange,
  layout = "toolbar",
}: {
  configuration: OperationFilterConfiguration;
  scope: OperationFilterScope;
  search: DashboardOperationSearch;
  pending: boolean;
  onChange: (next: Partial<DashboardOperationSearch>) => void;
  /** @deprecated Prefer toolbar; rail is kept for transitional layouts. */
  layout?: "grid" | "rail" | "toolbar";
}) {
  const t = useTranslations();
  const dateFormatter = useOperationDateFormatter();
  const chips = activeFilterChips(
    search,
    configuration,
    scope,
    t,
    dateFormatter.formatDateTimeCompact,
  );
  const activeCount = chips.length;
  const resolvedLayout = layout === "grid" ? "toolbar" : layout;
  const searchDraft = useOperationSearchDraft(search.q ?? "", (q) => onChange({ q }));

  // Clearing the query must also cancel an uncommitted draft; otherwise the
  // debounce would put the text back into the URL right after the reset.
  function handleFilterChange(next: Partial<DashboardOperationSearch>): void {
    if (next.q === "") {
      searchDraft.clear();
    }

    onChange(next);
  }

  if (resolvedLayout === "rail") {
    return (
      <OperationFiltersPanel
        configuration={configuration}
        scope={scope}
        search={search}
        pending={pending}
        onChange={handleFilterChange}
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
          <OperationSearchInput
            value={searchDraft.draft}
            pending={pending}
            placeholder={
              scope === "deliveries"
                ? t("operations.filters.searchPlaceholderDeliveries")
                : t("operations.filters.searchPlaceholder")
            }
            ariaLabel={t("operations.filters.search")}
            onChange={searchDraft.update}
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
              scope={scope}
              search={search}
              pending={pending}
              onChange={handleFilterChange}
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
              onClick={() => handleFilterChange(chip.clear)}
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
              handleFilterChange({
                sourceId: "",
                severity: "",
                status: "",
                deliveryOutcome: "",
                destinationId: "",
                destinationKind: "",
                routeId: "",
                deliveryState: "",
                minAttempts: 0,
                range: "",
                rangeAnchor: "",
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
  scope,
  search,
  pending,
  onChange,
  compact = false,
  className,
}: {
  configuration: OperationFilterConfiguration;
  scope: OperationFilterScope;
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
  const destinationKindItems = [
    { value: null, label: t("operations.filters.anyDestinationKind") },
    ...DestinationKindSchema.options.map((kind) => ({
      value: kind,
      label: t(`destinations.kinds.${kind}`),
    })),
  ];
  const routeItems = [
    { value: null, label: t("operations.filters.anyRoute") },
    ...(configuration.routes ?? []).map((route) => ({ value: route.id, label: route.name })),
  ];
  // `none` first: "which alerts never reached anyone" is the question on-call
  // opens the events list with. The rest mirror DeliveryStateSchema so a new
  // state cannot be silently missing from the filter.
  const deliveryOutcomeItems = [
    { value: null, label: t("operations.filters.anyOutcome") },
    { value: "none", label: t("operations.filters.deliveryOutcomeOptions.none") },
    ...DeliveryStateSchema.options.map((state) => ({
      value: state,
      label: t(`operations.filters.deliveryOutcomeOptions.${state}`),
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
      {scope === "events" ? (
        <UiField>
          <FieldLabel htmlFor="operation-delivery-outcome">
            {t("operations.filters.deliveryOutcome")}
          </FieldLabel>
          <Select
            id="operation-delivery-outcome"
            items={deliveryOutcomeItems}
            value={search.deliveryOutcome || null}
            disabled={pending}
            onValueChange={(value) =>
              onChange({
                deliveryOutcome: (value ?? "") as DashboardOperationSearch["deliveryOutcome"],
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("operations.filters.anyOutcome")} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {deliveryOutcomeItems.map((item) => (
                  <SelectItem key={item.value ?? "any"} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </UiField>
      ) : null}
      {scope === "deliveries" ? (
        <>
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
          <UiField>
            <FieldLabel htmlFor="operation-destination-kind">
              {t("operations.filters.destinationKind")}
            </FieldLabel>
            <Select
              id="operation-destination-kind"
              items={destinationKindItems}
              value={search.destinationKind || null}
              disabled={pending}
              onValueChange={(value) =>
                onChange({
                  destinationKind: (value ?? "") as DashboardOperationSearch["destinationKind"],
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("operations.filters.anyDestinationKind")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={null}>{t("operations.filters.anyDestinationKind")}</SelectItem>
                  {DestinationKindSchema.options.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {t(`destinations.kinds.${kind}`)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </UiField>
          <UiField>
            <FieldLabel htmlFor="operation-route">{t("operations.filters.route")}</FieldLabel>
            <Select
              id="operation-route"
              items={routeItems}
              value={search.routeId || null}
              disabled={pending}
              onValueChange={(value) => onChange({ routeId: value ?? "" })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("operations.filters.anyRoute")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={null}>{t("operations.filters.anyRoute")}</SelectItem>
                  {(configuration.routes ?? []).map((route) => (
                    <SelectItem key={route.id} value={route.id}>
                      {route.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </UiField>
        </>
      ) : null}
      <UiField>
        <FieldLabel htmlFor="operation-range">{t("operations.filters.timeRange")}</FieldLabel>
        <Select
          id="operation-range"
          items={[
            { value: null, label: t("operations.filters.anyTime") },
            { value: "15m", label: t("operations.filters.timeRangeOptions.15m") },
            { value: "1h", label: t("operations.filters.timeRangeOptions.1h") },
            { value: "6h", label: t("operations.filters.timeRangeOptions.6h") },
            { value: "24h", label: t("operations.filters.timeRangeOptions.24h") },
            { value: "7d", label: t("operations.filters.timeRangeOptions.7d") },
          ]}
          value={search.range || null}
          disabled={pending}
          onValueChange={(value) =>
            onChange({
              range: (value ?? "") as DashboardOperationSearch["range"],
              // Opening a window fixes its lower bound; otherwise every page
              // request resolves "last hour" against a later instant and rows
              // slide out from under the reader.
              rangeAnchor: value ? currentRangeAnchor() : "",
            })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("operations.filters.anyTime")} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={null}>{t("operations.filters.anyTime")}</SelectItem>
              <SelectItem value="15m">{t("operations.filters.timeRangeOptions.15m")}</SelectItem>
              <SelectItem value="1h">{t("operations.filters.timeRangeOptions.1h")}</SelectItem>
              <SelectItem value="6h">{t("operations.filters.timeRangeOptions.6h")}</SelectItem>
              <SelectItem value="24h">{t("operations.filters.timeRangeOptions.24h")}</SelectItem>
              <SelectItem value="7d">{t("operations.filters.timeRangeOptions.7d")}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </UiField>
      {scope === "deliveries" ? (
        <UiField>
          <FieldLabel htmlFor="operation-min-attempts">
            {t("operations.filters.minAttempts")}
          </FieldLabel>
          <Select
            id="operation-min-attempts"
            items={[
              { value: null, label: t("operations.filters.anyAttempts") },
              { value: "1", label: t("operations.filters.minAttemptsOptions.1") },
              { value: "2", label: t("operations.filters.minAttemptsOptions.2") },
              { value: "3", label: t("operations.filters.minAttemptsOptions.3") },
            ]}
            value={search.minAttempts ? String(search.minAttempts) : null}
            disabled={pending}
            onValueChange={(value) => onChange({ minAttempts: value ? Number(value) : 0 })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("operations.filters.anyAttempts")} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={null}>{t("operations.filters.anyAttempts")}</SelectItem>
                <SelectItem value="1">{t("operations.filters.minAttemptsOptions.1")}</SelectItem>
                <SelectItem value="2">{t("operations.filters.minAttemptsOptions.2")}</SelectItem>
                <SelectItem value="3">{t("operations.filters.minAttemptsOptions.3")}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </UiField>
      ) : null}
      {scope === "deliveries" ? (
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
      ) : null}
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
  configuration: OperationFilterConfiguration,
  scope: OperationFilterScope,
  t: TranslationFn,
  formatDateTimeCompact: (value: string) => string,
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

  if (scope === "events" && search.deliveryOutcome) {
    chips.push({
      key: "deliveryOutcome",
      label: t("operations.filters.deliveryOutcome"),
      valueLabel: t(`operations.filters.deliveryOutcomeOptions.${search.deliveryOutcome}`),
      clear: { deliveryOutcome: "" },
    });
  }

  if (scope === "deliveries" && search.destinationId) {
    const destination = configuration.destinations.find((item) => item.id === search.destinationId);
    chips.push({
      key: "destinationId",
      label: t("operations.filters.destination"),
      valueLabel: destination?.name ?? search.destinationId,
      clear: { destinationId: "" },
    });
  }

  if (scope === "deliveries" && search.destinationKind) {
    chips.push({
      key: "destinationKind",
      label: t("operations.filters.destinationKind"),
      valueLabel: t(`destinations.kinds.${search.destinationKind}`),
      clear: { destinationKind: "" },
    });
  }

  if (scope === "deliveries" && search.routeId) {
    const route = configuration.routes?.find((item) => item.id === search.routeId);
    chips.push({
      key: "routeId",
      label: t("operations.filters.route"),
      valueLabel: route?.name ?? search.routeId,
      clear: { routeId: "" },
    });
  }

  if (scope === "deliveries" && search.deliveryState) {
    chips.push({
      key: "deliveryState",
      label: t("operations.filters.deliveryState"),
      valueLabel: t(`common.deliveryState.${search.deliveryState}`),
      clear: { deliveryState: "" },
    });
  }

  if (scope === "deliveries" && search.minAttempts) {
    chips.push({
      key: "minAttempts",
      label: t("operations.filters.minAttempts"),
      valueLabel: t("operations.filters.minAttemptsAtLeast", { count: search.minAttempts }),
      clear: { minAttempts: 0 },
    });
  }

  if (search.range) {
    const rangeLabel = t(`operations.filters.timeRangeOptions.${search.range}`);
    chips.push({
      key: "range",
      label: t("operations.filters.timeRange"),
      // With an anchor the chip names the frozen lower bound, so a shared link
      // is self-describing instead of silently describing a different window
      // for every reader.
      valueLabel: search.rangeAnchor
        ? t("operations.filters.timeRangeAnchored", {
            range: rangeLabel,
            time: formatDateTimeCompact(search.rangeAnchor),
          })
        : rangeLabel,
      clear: { range: "", rangeAnchor: "" },
    });
  }

  return chips;
}

/**
 * The instant a newly opened window is pinned to.
 *
 * Whole seconds keep the URL readable; sub-second precision cannot change which
 * rows fall inside any of the offered windows.
 */
function currentRangeAnchor(): string {
  return new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
}

/**
 * Search text is typed locally and committed after a pause.
 *
 * Writing every keystroke to the URL used to do two things at once: each
 * navigation re-rendered the input from the trimmed URL value (so "Disk usage"
 * collapsed to "diskusage"), and each key fired a server query. The draft keeps
 * the operator's exact text — including a trailing space — while the debounce
 * collapses a burst of typing into one navigation.
 */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The draft lives with the filter bar, not inside the input, because "Reset
 * filters" and the query chip both clear the committed value. Clearing has to
 * cancel an uncommitted draft at the same time, and only this scope sees both.
 */
function useOperationSearchDraft(value: string, commit: (next: string) => void) {
  const [draft, setDraft] = React.useState(value);
  // The last value this draft sent to the URL. An incoming `value` that matches
  // it is our own commit echoing back, so it must not overwrite characters the
  // operator typed while the navigation was in flight.
  const committed = React.useRef(value);
  const timer = React.useRef<number | null>(null);
  const commitRef = React.useRef(commit);

  React.useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  React.useEffect(() => {
    if (value === committed.current) {
      return;
    }

    // An external change — browser history, or a filter the operator applied
    // elsewhere — wins over an uncommitted draft.
    committed.current = value;
    setDraft(value);
    cancelPending(timer);
  }, [value]);

  React.useEffect(() => () => cancelPending(timer), []);

  function update(next: string): void {
    setDraft(next);
    cancelPending(timer);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      committed.current = next;
      commitRef.current(next);
    }, SEARCH_DEBOUNCE_MS);
  }

  function clear(): void {
    cancelPending(timer);
    committed.current = "";
    setDraft("");
  }

  return { draft, update, clear };
}

function OperationSearchInput({
  value,
  pending,
  placeholder,
  ariaLabel,
  onChange,
}: {
  value: string;
  pending: boolean;
  placeholder: string;
  ariaLabel: string;
  onChange: (next: string) => void;
}) {
  return (
    <Input
      id="operation-search"
      value={value}
      aria-busy={pending}
      placeholder={placeholder}
      className="h-8 pl-7"
      maxLength={OPERATION_SEARCH_MAX_LENGTH}
      onChange={(event) => onChange(event.currentTarget.value)}
      aria-label={ariaLabel}
    />
  );
}

function cancelPending(timer: React.MutableRefObject<number | null>): void {
  if (timer.current !== null) {
    window.clearTimeout(timer.current);
    timer.current = null;
  }
}
