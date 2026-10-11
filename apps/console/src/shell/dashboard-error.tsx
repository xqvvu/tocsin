import { RiErrorWarningLine, RiRefreshLine } from "@remixicon/react";
import { Link, useLocation, useRouter, type ErrorComponentProps } from "@tanstack/react-router";

import { redactText } from "@tocsin/core";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button, buttonVariants } from "#/components/ui/button";
import { Separator } from "#/components/ui/separator";
import { useTranslations } from "#/i18n/use-i18n";
import { hardReloadPage } from "#/lib/browser";

const recoveryLinks = [
  { labelKey: "events", to: "/events" },
  { labelKey: "sources", to: "/sources" },
  { labelKey: "routes", to: "/routes" },
  { labelKey: "settings", to: "/settings" },
] as const;

export function DashboardErrorPage({ error, reset }: ErrorComponentProps) {
  const t = useTranslations();

  const router = useRouter();
  const currentPath = useLocation({
    select: (location) => location.href,
  });
  const redactedCurrentPath = redactText(currentPath);

  function tryAgain() {
    reset();
    void router.invalidate();
  }

  return (
    <div className="flex min-h-[calc(100vh-3rem)] w-full items-center justify-center px-3 py-10 sm:px-8">
      <main className="flex w-full max-w-3xl flex-col gap-5">
        <Alert variant="destructive" className="px-4 py-5">
          <RiErrorWarningLine aria-hidden />
          <AlertTitle className="flex flex-wrap items-center gap-3">
            <Badge variant="destructive" className="font-mono font-bold">
              {t("shell.error.badge")}
            </Badge>
            <h1 className="font-heading text-xl font-semibold">{t("shell.error.title")}</h1>
          </AlertTitle>
          <AlertDescription className="mt-3 text-sm">
            {t("shell.error.description")}
          </AlertDescription>
        </Alert>

        <section className="border-border bg-muted/40 border p-4">
          <div className="text-muted-foreground text-[11px] font-bold tracking-[0.14em] uppercase">
            {t("shell.error.summaryLabel")}
          </div>
          <div className="border-border bg-background mt-3 border p-4">
            <div className="font-mono text-xs font-semibold wrap-break-word">
              {safeErrorSummary(error, {
                known: (message) => t("shell.error.summaryKnown", { message }),
                unknown: t("shell.error.summaryUnknown"),
              })}
            </div>
            <code className="text-muted-foreground mt-2 block truncate font-mono text-xs">
              {t("shell.error.traceId")}
            </code>
          </div>
        </section>

        <div
          className="flex flex-wrap items-center gap-2"
          aria-label={t("shell.error.actionsLabel")}
        >
          <Button type="button" size="sm" onClick={tryAgain}>
            <RiRefreshLine data-icon="inline-start" aria-hidden />
            {t("common.actions.tryAgain")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => hardReloadPage()}>
            {t("common.actions.reloadPage")}
          </Button>
          <Separator orientation="vertical" className="mx-2 hidden h-7 sm:block" />
          {recoveryLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              {t(`common.routes.${link.labelKey}`)}
            </Link>
          ))}
        </div>

        <section className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-muted-foreground">{t("shell.error.context")}</span>
          <code className="border-border bg-muted max-w-full truncate border px-2 py-1 font-mono">
            {redactedCurrentPath}
          </code>
        </section>
      </main>
    </div>
  );
}

function safeErrorSummary(
  error: unknown,
  messages: { known: (message: string) => string; unknown: string },
): string {
  if (error instanceof Error) {
    const message = error.message ? redactText(error.message) : error.name || "Error";

    return messages.known(message);
  }

  return messages.unknown;
}
