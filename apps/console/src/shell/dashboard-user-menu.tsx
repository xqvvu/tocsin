import { createClientOnlyFn } from "@tanstack/react-start";
import * as React from "react";

import { Skeleton } from "#/components/ui/skeleton";
import { useTranslations } from "#/i18n/use-i18n";

export interface DashboardUserMenuProps {
  user: {
    name: string | null;
    email: string;
    image: string | null;
    role: string | null;
  };
  variant?: "header" | "sidebar";
}

const DashboardUserMenuClient = React.lazy(
  createClientOnlyFn(async () => {
    const module = await import("#/shell/dashboard-user-menu-impl");

    return { default: module.DashboardUserMenuClient };
  }),
);

function DashboardUserMenuRoot(props: DashboardUserMenuProps) {
  return <DashboardUserMenuClient {...props} />;
}

function DashboardUserMenuSkeleton() {
  const t = useTranslations();

  return <Skeleton className="size-7 rounded-full" aria-label={t("shell.userMenu.loading")} />;
}

export const DashboardUserMenu = Object.assign(DashboardUserMenuRoot, {
  Skeleton: DashboardUserMenuSkeleton,
});
