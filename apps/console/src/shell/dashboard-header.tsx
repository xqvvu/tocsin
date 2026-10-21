import { useRouterState } from "@tanstack/react-router";

import { Separator } from "#/components/ui/separator";
import { SidebarTrigger } from "#/components/ui/sidebar";
import { DeliveryPauseIndicator } from "#/features/configuration/ui/delivery-pause-indicator";
import { ActiveSuppressionIndicator } from "#/features/suppressions/ui/active-suppression-indicator";
import { useTranslations } from "#/i18n/use-i18n";
import { dashboardNavItemForPath } from "#/shell/dashboard-navigation";

export function DashboardHeader() {
  const t = useTranslations();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const currentItem = dashboardNavItemForPath(pathname);
  const CurrentIcon = currentItem?.icon;

  return (
    <header className="border-border bg-card flex h-12 shrink-0 items-center gap-2 border-b px-2">
      <SidebarTrigger label={t("shell.nav.toggle")} />

      <Separator orientation="vertical" className="h-4" />

      <div className="flex min-w-0 items-center gap-2 px-1">
        {CurrentIcon ? (
          <CurrentIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
        ) : null}
        <span className="truncate text-sm font-medium">
          {currentItem ? t(currentItem.labelKey) : t("shell.nav.consoleLabel")}
        </span>
      </div>

      <div className="ml-auto flex shrink-0 items-center">
        <DeliveryPauseIndicator />
        <ActiveSuppressionIndicator />
      </div>
    </header>
  );
}
