import type { AlertSeverity } from "@tocsin/core";

import { useTranslations } from "#/i18n/use-i18n";
import { cn } from "#/lib/utils";

export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const t = useTranslations();

  return (
    <span
      className={cn(
        "inline-flex items-center border px-1.5 py-0.5 text-[11px] font-medium",
        severity === "critical"
          ? "border-red-600/30 bg-red-50 text-red-700"
          : severity === "warning"
            ? "border-amber-600/30 bg-amber-50 text-amber-700"
            : "border-slate-300 bg-slate-100 text-slate-600",
      )}
    >
      {t(`common.severity.${severity}`)}
    </span>
  );
}
