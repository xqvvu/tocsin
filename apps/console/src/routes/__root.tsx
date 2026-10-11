import { TanStackDevtools } from "@tanstack/react-devtools";
import { useSuspenseQuery, type QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { HeadContent, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import { Toaster } from "#/components/ui/sonner";
import { TooltipProvider } from "#/components/ui/tooltip";
import { dashboardSessionQueryOptions } from "#/features/auth/api/auth.queries";
import { requestLocaleQueryOptions } from "#/i18n/i18n.queries";
import { AppIntlProvider } from "#/i18n/provider";
import { DashboardErrorPage } from "#/shell/dashboard-error";
import { DashboardLayout } from "#/shell/dashboard-layout";
import { DashboardNotFoundPage } from "#/shell/dashboard-not-found";

import appCss from "#/styles.css?url";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  loader: ({ context }) => context.queryClient.ensureQueryData(requestLocaleQueryOptions()),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Tocsin" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.json" },
    ],
  }),
  shellComponent: Root,
  errorComponent: DashboardErrorPage,
  notFoundComponent: RootNotFound,
});

function Root({ children }: { children: React.ReactNode }) {
  const { data } = useSuspenseQuery(requestLocaleQueryOptions());

  return (
    <html lang={data.locale}>
      <head>
        <HeadContent />
      </head>

      <body className="h-dvh">
        <AppIntlProvider locale={data.locale} timeZone={data.timeZone}>
          <TooltipProvider>{children}</TooltipProvider>
        </AppIntlProvider>

        <Toaster position="top-right" />

        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            { name: "Tanstack Query", render: <ReactQueryDevtoolsPanel /> },
            { name: "Tanstack Router", render: <TanStackRouterDevtoolsPanel /> },
          ]}
        />

        <Scripts />
      </body>
    </html>
  );
}

function RootNotFound() {
  const { data: session } = useSuspenseQuery(dashboardSessionQueryOptions());

  if (!session) {
    return <DashboardNotFoundPage />;
  }

  return (
    <DashboardLayout user={session.user}>
      <DashboardNotFoundPage />
    </DashboardLayout>
  );
}
