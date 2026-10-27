import { RiShieldCheckLine } from "@remixicon/react";
import { Link } from "@tanstack/react-router";

import type { Suppression } from "@tocsin/core";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button, buttonVariants } from "#/components/ui/button";
import { formatDateTime, formatDurationMs } from "#/features/operations/model/operation-format";
import { fallbackTimeZone } from "#/i18n/time-zone";
import { useLocale, useTranslations, useTimeZone } from "#/i18n/use-i18n";
import { useOperationalNow } from "#/i18n/use-operational-now";
import { cn } from "#/lib/utils";

/**
 * Confirms a one-click silence with the rule it actually created.
 *
 * The dialog used to close on the first successful save, leaving a toast as the
 * only evidence: the operator could not check the generated window or open the
 * rule again without leaving the page they were triaging. The notice keeps that
 * confirmation where the action happened and links straight to the rule.
 */
export function SuppressionCreatedNotice({
  suppression,
  onDone,
}: {
  suppression: Suppression;
  onDone: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const timeZone = useTimeZone() ?? fallbackTimeZone;
  const now = useOperationalNow();
  const endsAtMs = Date.parse(suppression.endsAt);
  const remainingMs = endsAtMs - now.getTime();
  // A hand-edited row or a client clock past the window must not turn the
  // confirmation into "NaN" or a negative countdown; the link stays usable.
  const endsAt = Number.isFinite(endsAtMs)
    ? formatDateTime(suppression.endsAt, { locale, timeZone })
    : null;
  const remaining =
    Number.isFinite(remainingMs) && remainingMs > 0 ? formatDurationMs(remainingMs) : null;

  return (
    <Alert>
      <RiShieldCheckLine aria-hidden />
      <AlertTitle>{t("suppressions.created.title")}</AlertTitle>
      <AlertDescription>
        <p>{t("suppressions.created.description", { name: suppression.name })}</p>
        {endsAt ? (
          <p>
            {t("suppressions.created.endsAt", { time: endsAt })}
            {remaining
              ? ` · ${t("suppressions.created.remaining", { duration: remaining })}`
              : null}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Link
            to="/suppressions/$suppressionId"
            params={{ suppressionId: suppression.id }}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit")}
          >
            {t("suppressions.created.view")}
          </Link>
          <Button type="button" size="sm" onClick={onDone}>
            {t("suppressions.created.done")}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
