import { SidebarTrigger } from "#/components/ui/sidebar";
import { DeliveryPauseIndicator } from "#/features/configuration/ui/delivery-pause-indicator";
import { DeliveryFailureIndicator } from "#/features/deliveries/ui/delivery-failure-indicator";
import { ActiveSuppressionIndicator } from "#/features/suppressions/ui/active-suppression-indicator";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * App chrome only: the sidebar toggle and the cross-page operational
 * indicators.
 *
 * The current page name belongs to the page, not to this bar. It used to be
 * rendered here as a small icon + label, which duplicated the highlighted
 * sidebar item, sat at a different weight than every page heading, and left the
 * list pages without a real `<h1>`. Each page's `PageToolbar` now owns its
 * title, so the shell stays identical on every route.
 */
export function DashboardHeader() {
  const t = useTranslations();

  return (
    <header className="border-border bg-card flex h-12 shrink-0 items-center gap-2 border-b px-2">
      <SidebarTrigger label={t("shell.nav.toggle")} />

      <div className="ml-auto flex shrink-0 items-center">
        <DeliveryPauseIndicator />
        <DeliveryFailureIndicator />
        <ActiveSuppressionIndicator />
      </div>
    </header>
  );
}
