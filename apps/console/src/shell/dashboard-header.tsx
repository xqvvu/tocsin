import { ClientOnly, Link } from "@tanstack/react-router";
import * as React from "react";

import { useTranslations } from "#/i18n/use-i18n";
import { DashboardUserMenu } from "#/shell/dashboard-user-menu";

export interface DashboardHeaderProps {
  user: {
    name: string | null;
    email: string;
    image: string | null;
    role: string | null;
  };
}

export function DashboardHeader({ user }: DashboardHeaderProps) {
  const t = useTranslations();

  return (
    <header className="border-border bg-card sticky top-0 z-50 h-12 shrink-0 border-b">
      <div className="flex h-12 w-full items-center justify-between gap-4 px-3">
        <div className="flex h-full min-w-0 items-center gap-6">
          <Link
            to="/events"
            className="font-heading text-primary shrink-0 text-base font-extrabold tracking-tight"
          >
            Tocsin
          </Link>
          <nav
            className="flex h-full min-w-0 items-center overflow-x-auto text-sm"
            aria-label={t("shell.nav.ariaLabel")}
          >
            <DashboardNavLink to="/events">{t("common.routes.events")}</DashboardNavLink>
            <DashboardNavLink to="/sources">{t("common.routes.sources")}</DashboardNavLink>
            <DashboardNavLink to="/routes">{t("common.routes.routes")}</DashboardNavLink>
            <DashboardNavLink to="/destinations">
              {t("common.routes.destinations")}
            </DashboardNavLink>
            <DashboardNavLink to="/integrations">
              {t("common.routes.integrations")}
            </DashboardNavLink>
            <DashboardNavLink to="/deliveries">{t("common.routes.deliveries")}</DashboardNavLink>
            <DashboardNavLink to="/settings">{t("common.routes.settings")}</DashboardNavLink>
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ClientOnly fallback={<DashboardUserMenu.Skeleton />}>
            <React.Suspense fallback={<DashboardUserMenu.Skeleton />}>
              <DashboardUserMenu user={user} />
            </React.Suspense>
          </ClientOnly>
        </div>
      </div>
    </header>
  );
}

function DashboardNavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      activeProps={{
        className: "border-primary text-primary font-semibold",
      }}
      inactiveProps={{
        className: "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
      }}
      className="flex h-full items-center border-b-2 px-3 font-medium whitespace-nowrap transition-colors"
    >
      {children}
    </Link>
  );
}
