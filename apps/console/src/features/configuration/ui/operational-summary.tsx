import type { DestinationSummary, RouteDefinition, SourceSummary } from "@tocsin/core";

import { useTranslations } from "#/i18n/use-i18n";
import { cn } from "#/lib/utils";

export function OperationalSummary({
  sources,
  destinations,
  routes,
  layout = "grid",
  retentionDays,
}: {
  sources: SourceSummary[];
  destinations: DestinationSummary[];
  routes: RouteDefinition[];
  layout?: "grid" | "rail";
  retentionDays?: number;
}) {
  const t = useTranslations();
  const enabledSources = sources.filter((source) => source.enabled).length;
  const enabledDestinations = destinations.filter((destination) => destination.enabled).length;
  const enabledRoutes = routes.filter((route) => route.enabled).length;
  const gridClassName =
    layout === "rail"
      ? "grid-cols-1 gap-3"
      : retentionDays === undefined
        ? "grid-cols-1 gap-px border bg-border md:grid-cols-3"
        : "grid-cols-2 gap-px border bg-border md:grid-cols-4";

  return (
    <div className={cn("grid", gridClassName)}>
      <Metric
        layout={layout}
        label={t("configuration.summary.enabledSources")}
        value={enabledSources}
        total={sources.length}
      />
      <Metric
        layout={layout}
        label={t("configuration.summary.enabledDestinations")}
        value={enabledDestinations}
        total={destinations.length}
      />
      <Metric
        layout={layout}
        label={t("configuration.summary.enabledRoutes")}
        value={enabledRoutes}
        total={routes.length}
      />
      {retentionDays === undefined ? null : (
        <Metric
          layout={layout}
          label={t("configuration.summary.rawPayloadRetention")}
          value={retentionDays}
          suffix={t("configuration.summary.days")}
        />
      )}
    </div>
  );
}

function Metric({
  layout,
  label,
  value,
  total,
  suffix,
}: {
  layout: "grid" | "rail";
  label: string;
  value: number;
  total?: number;
  suffix?: string;
}) {
  return (
    <div
      className={cn("bg-card min-w-0 px-3 py-3", layout === "rail" ? "border-border border" : null)}
    >
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-semibold">{value}</span>
        {total === undefined ? null : (
          <span className="text-muted-foreground text-xs">/ {total}</span>
        )}
        {suffix ? <span className="text-muted-foreground text-xs">{suffix}</span> : null}
      </div>
    </div>
  );
}
