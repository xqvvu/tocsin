import { RiShieldKeyholeLine } from "@remixicon/react";
import { createClientOnlyFn } from "@tanstack/react-start";
import * as React from "react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { Skeleton } from "#/components/ui/skeleton";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Shown when a session exists but cannot use the dashboard.
 *
 * The interactive part (which needs the browser auth client to sign out) is
 * loaded client-only; this wrapper is what the route renders, so the server
 * build never pulls in browser-only code.
 */

function DashboardForbiddenSkeleton() {
  const t = useTranslations();

  return (
    <div className="flex min-h-screen w-full items-center justify-center px-4 py-10">
      <Empty className="max-w-md">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <RiShieldKeyholeLine aria-hidden />
          </EmptyMedia>
          <EmptyTitle>{t("shell.forbidden.title")}</EmptyTitle>
          <EmptyDescription>{t("shell.forbidden.description")}</EmptyDescription>
        </EmptyHeader>
        <Skeleton className="h-8 w-24" aria-hidden />
      </Empty>
    </div>
  );
}

const DashboardForbiddenClient = React.lazy(
  createClientOnlyFn(async () => {
    const module = await import("#/shell/dashboard-forbidden-impl");

    return { default: module.DashboardForbiddenClient };
  }),
);

export const DashboardForbiddenPage = Object.assign(
  function DashboardForbiddenRoot() {
    return (
      <React.Suspense fallback={<DashboardForbiddenSkeleton />}>
        <DashboardForbiddenClient />
      </React.Suspense>
    );
  },
  { Skeleton: DashboardForbiddenSkeleton },
);
