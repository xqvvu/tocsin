import {
  RiAlertLine,
  RiApps2Line,
  RiBellLine,
  RiNotificationOffLine,
  RiRouteLine,
  RiSendPlaneLine,
  RiSettings3Line,
  RiTruckLine,
  RiWebhookLine,
  type RemixiconComponentType,
} from "@remixicon/react";
import { ClientOnly, Link, useRouterState } from "@tanstack/react-router";
import * as React from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "#/components/ui/sidebar";
import { Skeleton } from "#/components/ui/skeleton";
import { useTranslations } from "#/i18n/use-i18n";
import { DashboardUserMenu } from "#/shell/dashboard-user-menu";

export interface DashboardNavigationProps {
  user: {
    name: string | null;
    email: string;
    image: string | null;
    role: string | null;
  };
}

interface DashboardNavItem {
  to: string;
  labelKey: string;
  icon: RemixiconComponentType;
}

interface DashboardNavGroup {
  labelKey: string;
  items: readonly DashboardNavItem[];
}

export const dashboardNavGroups: readonly DashboardNavGroup[] = [
  {
    labelKey: "shell.nav.groups.operations",
    items: [
      { to: "/events", labelKey: "common.routes.events", icon: RiAlertLine },
      { to: "/sources", labelKey: "common.routes.sources", icon: RiWebhookLine },
      { to: "/routes", labelKey: "common.routes.routes", icon: RiRouteLine },
      {
        to: "/suppressions",
        labelKey: "common.routes.suppressions",
        icon: RiNotificationOffLine,
      },
    ],
  },
  {
    labelKey: "shell.nav.groups.delivery",
    items: [
      { to: "/destinations", labelKey: "common.routes.destinations", icon: RiSendPlaneLine },
      { to: "/deliveries", labelKey: "common.routes.deliveries", icon: RiTruckLine },
    ],
  },
  {
    labelKey: "shell.nav.groups.system",
    items: [
      { to: "/integrations", labelKey: "common.routes.integrations", icon: RiApps2Line },
      { to: "/settings", labelKey: "common.routes.settings", icon: RiSettings3Line },
    ],
  },
];

const dashboardNavItems = dashboardNavGroups.flatMap((group) => group.items);

export function dashboardNavItemForPath(pathname: string): DashboardNavItem | undefined {
  return dashboardNavItems.find(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
}

export function DashboardNavigation({ user }: DashboardNavigationProps) {
  const t = useTranslations();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const currentItem = dashboardNavItemForPath(pathname);
  const { isMobile, setOpenMobile } = useSidebar();

  function closeMobileNavigation() {
    if (isMobile) {
      setOpenMobile(false);
    }
  }

  return (
    <Sidebar
      collapsible="icon"
      mobileTitle={t("shell.nav.ariaLabel")}
      mobileDescription={t("shell.nav.mobileDescription")}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link to="/events" aria-label={t("shell.nav.homeLabel")} />}
              onClick={closeMobileNavigation}
            >
              <div className="bg-primary text-primary-foreground flex aspect-square size-8 shrink-0 items-center justify-center">
                <RiBellLine aria-hidden />
              </div>
              <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                <span className="font-heading truncate text-sm font-extrabold tracking-tight">
                  Tocsin
                </span>
                <span className="text-sidebar-foreground/60 truncate text-[10px]">
                  {t("shell.nav.brandSubtitle")}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <nav aria-label={t("shell.nav.ariaLabel")} className="flex flex-col">
          {dashboardNavGroups.map((group) => (
            <SidebarGroup key={group.labelKey}>
              <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const label = t(item.labelKey);

                    return (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton
                          render={<Link to={item.to} />}
                          isActive={currentItem === item}
                          aria-current={currentItem === item ? "page" : undefined}
                          tooltip={label}
                          onClick={closeMobileNavigation}
                        >
                          <item.icon aria-hidden />
                          <span>{label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <ClientOnly fallback={<DashboardUserMenu.Skeleton />}>
              <React.Suspense fallback={<DashboardUserMenu.Skeleton />}>
                <DashboardUserMenu user={user} variant="sidebar" />
              </React.Suspense>
            </ClientOnly>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail label={t("shell.nav.toggle")} />
    </Sidebar>
  );
}

export function DashboardNavigationSkeleton() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex h-12 items-center gap-2 px-2">
              <Skeleton className="size-8 shrink-0" />
              <div className="grid flex-1 gap-1.5 group-data-[collapsible=icon]:hidden">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-2.5 w-12" />
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        {dashboardNavGroups.map((group) => (
          <SidebarGroup key={group.labelKey}>
            <SidebarGroupLabel>
              <Skeleton className="h-3 w-12" />
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <div className="flex h-8 items-center gap-2 px-2">
                      <Skeleton className="size-4 shrink-0" />
                      <Skeleton className="h-3.5 w-20 group-data-[collapsible=icon]:hidden" />
                    </div>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex h-12 items-center gap-2 px-2">
              <Skeleton className="size-6 shrink-0 rounded-full" />
              <div className="grid flex-1 gap-1.5 group-data-[collapsible=icon]:hidden">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-2.5 w-32" />
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
