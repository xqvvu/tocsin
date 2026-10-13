import type { ReactNode } from "react";

import { Skeleton } from "#/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import { cn } from "#/lib/utils";
import { DashboardHeader } from "#/shell/dashboard-header";
import { DashboardSidebar } from "#/shell/dashboard-sidebar";

export interface DashboardLayoutProps {
  user: {
    name: string | null;
    email: string;
    image: string | null;
    role: string | null;
  };
  children: ReactNode;
}

function DashboardLayoutRoot({ user, children }: DashboardLayoutProps) {
  return (
    <main className="bg-background text-foreground flex h-dvh flex-col overflow-hidden">
      <DashboardHeader user={user} />
      {children}
    </main>
  );
}

function DashboardLayoutSkeleton() {
  return (
    <main className="bg-background text-foreground flex h-dvh flex-col overflow-hidden">
      <DashboardHeaderSkeleton />
      <DashboardContentLayout.Skeleton />
    </main>
  );
}

export const DashboardLayout = Object.assign(DashboardLayoutRoot, {
  Skeleton: DashboardLayoutSkeleton,
});

export interface DashboardContentLayoutProps {
  main: ReactNode;
  sidebar?: ReactNode;
}

function DashboardContentLayoutRoot({ main, sidebar }: DashboardContentLayoutProps) {
  return (
    <div
      className={cn(
        "mx-auto grid min-h-0 w-full max-w-7xl flex-1 gap-4 overflow-hidden px-5 py-5",
        sidebar ? "xl:grid-cols-[minmax(0,1fr)_360px]" : "grid-cols-1",
      )}
    >
      <section className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto">{main}</section>
      {sidebar}
    </div>
  );
}

function DashboardContentLayoutSkeleton() {
  return (
    <DashboardContentLayoutRoot
      main={
        <>
          <DashboardToolbarSkeleton />
          <DashboardTableSkeleton />
        </>
      }
    />
  );
}

function DashboardContentLayoutSkeletonWithRail() {
  return (
    <DashboardContentLayoutRoot
      main={
        <>
          <DashboardToolbarSkeleton />
          <DashboardTableSkeleton columnCount={6} />
        </>
      }
      sidebar={
        <DashboardSidebar variant="split">
          <DashboardRailSkeleton />
        </DashboardSidebar>
      }
    />
  );
}

function DashboardDetailLayoutSkeleton() {
  return (
    <DashboardContentLayoutRoot
      main={
        <>
          <DashboardToolbarSkeleton detail />
          <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <DashboardPanelSkeleton rows={4} />
            <DashboardPanelSkeleton rows={6} />
          </div>
          <DashboardPanelSkeleton rows={5} />
        </>
      }
    />
  );
}

function DashboardSettingsLayoutSkeleton() {
  return (
    <DashboardContentLayoutRoot
      main={
        <>
          <DashboardToolbarSkeleton tabs />
          <DashboardPanelSkeleton rows={2} metrics />
          <div className="grid gap-4 lg:grid-cols-2">
            <DashboardPanelSkeleton rows={4} />
            <DashboardPanelSkeleton rows={3} />
          </div>
        </>
      }
    />
  );
}

function DashboardHeaderSkeleton() {
  return (
    <header className="border-border bg-card sticky top-0 z-50 h-12 shrink-0 border-b">
      <div className="flex h-12 w-full items-center justify-between gap-4 px-3">
        <div className="flex h-full min-w-0 items-center gap-6">
          <Skeleton className="h-5 w-12 shrink-0" />
          <div className="hidden h-full min-w-0 items-center gap-5 sm:flex">
            {dashboardNavSkeletons.map((item) => (
              <Skeleton key={item} className="h-4 w-18" />
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Skeleton className="size-7 rounded-full" />
        </div>
      </div>
    </header>
  );
}

function DashboardTableSkeleton({ columnCount = 5 }: { columnCount?: number }) {
  return (
    <section className="bg-background flex min-h-0 flex-1 flex-col">
      <div className="border-border min-h-0 flex-1 overflow-auto border">
        <Table className="min-w-245 table-fixed">
          <TableHeader className="bg-muted/60 sticky top-0 z-10">
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              {Array.from({ length: columnCount }, (_, index) => (
                <TableHead
                  key={index}
                  className={cn(
                    "h-8 px-3 text-center align-middle",
                    index === 0 ? "w-[30%] text-left" : null,
                  )}
                >
                  <Skeleton className="mx-auto h-3 w-14" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {dashboardRowSkeletons.map((row, rowIndex) => (
              <TableRow key={row} className="hover:bg-muted/50">
                <TableCell className="h-16 px-3 py-3 text-left align-middle">
                  <div className="min-w-0">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="mt-2 h-3 w-1/2" />
                  </div>
                </TableCell>
                {Array.from({ length: columnCount - 1 }, (_, columnIndex) => (
                  <TableCell
                    key={`${row}-${columnIndex}`}
                    className="h-16 px-3 py-3 text-center align-middle"
                  >
                    <Skeleton
                      className={cn(
                        "mx-auto h-4",
                        dashboardCellSkeletonWidths[
                          (rowIndex + columnIndex) % dashboardCellSkeletonWidths.length
                        ],
                      )}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="border-border bg-background flex shrink-0 flex-col gap-3 border-x border-b px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-4 w-28" />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Skeleton className="h-4 w-18" />
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-7 w-16" />
        </div>
      </div>
    </section>
  );
}

function DashboardRailSkeleton() {
  return (
    <>
      <div className="border-border bg-background grid gap-2 border p-2">
        {sidebarFieldSkeletons.map((field) => (
          <div key={field} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-3">
        {dashboardMetricSkeletons.map((metric) => (
          <div key={metric} className="border-border bg-card border px-3 py-3">
            <Skeleton className="h-3 w-32" />
            <div className="mt-2 flex items-baseline gap-1">
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-3 w-10" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function DashboardPanelSkeleton({ metrics, rows }: { metrics?: boolean; rows: number }) {
  return (
    <section className="border-border bg-card border">
      <div className="border-border flex items-center justify-between border-b px-3 py-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-6 w-18" />
      </div>
      <div className="p-3">
        {metrics ? (
          <div className="grid gap-3 md:grid-cols-4">
            {dashboardMetricSkeletons.map((metric) => (
              <div key={metric} className="border-border bg-card border px-3 py-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2 h-8 w-10" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {Array.from({ length: rows }, (_, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)]">
                <Skeleton className="h-3 w-24" />
                <Skeleton
                  className={cn(
                    "h-4",
                    dashboardDetailSkeletonWidths[index % dashboardDetailSkeletonWidths.length],
                  )}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

interface DashboardToolbarSkeletonProps {
  detail?: boolean;
  tabs?: boolean;
}

function DashboardToolbarSkeleton({ detail, tabs }: DashboardToolbarSkeletonProps = {}) {
  return (
    <header className="border-border bg-background flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-3">
        {detail ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-44 max-w-full" />
          </div>
        ) : null}
        <Skeleton className="h-4 w-[min(34rem,100%)]" />
        {tabs ? (
          <div className="flex min-w-0 items-center gap-6">
            <Skeleton className="h-5 w-7" />
            <Skeleton className="h-5 w-12" />
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-7 w-20" />
      </div>
    </header>
  );
}

const dashboardNavSkeletons = [
  "events",
  "sources",
  "routes",
  "suppressions",
  "destinations",
  "integrations",
  "deliveries",
  "settings",
];
const dashboardRowSkeletons = ["row-1", "row-2", "row-3", "row-4", "row-5", "row-6"];
const sidebarFieldSkeletons = ["field-1", "field-2", "field-3", "field-4", "field-5"];
const dashboardMetricSkeletons = ["metric-1", "metric-2", "metric-3", "metric-4"];
const dashboardCellSkeletonWidths = ["w-16", "w-20", "w-24", "w-12"];
const dashboardDetailSkeletonWidths = ["w-3/4", "w-2/3", "w-5/6", "w-1/2"];

export const DashboardContentLayout = Object.assign(DashboardContentLayoutRoot, {
  Skeleton: DashboardContentLayoutSkeleton,
  SkeletonWithRail: DashboardContentLayoutSkeletonWithRail,
  DetailSkeleton: DashboardDetailLayoutSkeleton,
  SettingsSkeleton: DashboardSettingsLayoutSkeleton,
});
