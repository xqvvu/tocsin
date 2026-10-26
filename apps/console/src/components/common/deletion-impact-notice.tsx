import { RiDeleteBinLine, RiErrorWarningLine, RiRefreshLine } from "@remixicon/react";

import type { DeletionImpact } from "@tocsin/core";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Skeleton } from "#/components/ui/skeleton";
import { useTranslations } from "#/i18n/use-i18n";

export type DeletionImpactLoadState = "idle" | "loading" | "ready" | "error";

/**
 * Discloses the history a configuration delete takes with it and gates the
 * destructive action behind an explicit acknowledgement.
 *
 * Presentation only: the caller owns the preview request, the load state, and
 * whether the confirmed flag disables its delete button. Reads no query state
 * and calls no procedure, so every feature can reuse it without inheriting
 * another feature's business rules.
 */
export function DeletionImpactNotice({
  impact,
  state,
  confirmed,
  onConfirmedChange,
  onRetry,
}: {
  impact: DeletionImpact | null;
  state: DeletionImpactLoadState;
  confirmed: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
  /**
   * Re-issues the preview request. Omitted by callers that cannot retry, in
   * which case the error alert carries no action.
   */
  onRetry?: () => void;
}) {
  const t = useTranslations();

  if (state === "idle") {
    return null;
  }

  if (state === "loading") {
    // `role="status"` makes the wait audible: the skeletons alone carry no text
    // for a screen reader, and an sr-only string outside a live region is never
    // announced.
    return (
      <div role="status" className="flex flex-col gap-1">
        <p className="text-muted-foreground text-xs">{t("common.deletionImpact.loading")}</p>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }

  if (state === "error" || !impact) {
    // An unreadable preview is a warning, not a lock: the operator still has to
    // be able to clear a broken configuration from a degraded instance, and
    // must be able to ask again without closing the dialog.
    return (
      <Alert>
        <RiErrorWarningLine aria-hidden />
        <AlertTitle>{t("common.deletionImpact.errorTitle")}</AlertTitle>
        <AlertDescription>{t("common.deletionImpact.errorDescription")}</AlertDescription>
        {onRetry ? (
          <AlertAction>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RiRefreshLine data-icon="inline-start" aria-hidden />
              {t("common.actions.tryAgain")}
            </Button>
          </AlertAction>
        ) : null}
      </Alert>
    );
  }

  const total =
    impact.eventCount + impact.deliveryCount + impact.attemptCount + impact.oncallPingCount;

  if (total === 0) {
    return <p className="text-muted-foreground text-xs">{t("common.deletionImpact.none")}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <Alert variant="destructive">
        <RiDeleteBinLine aria-hidden />
        <AlertTitle>{t("common.deletionImpact.title")}</AlertTitle>
        <AlertDescription>
          <span>{t("common.deletionImpact.description")}</span>
          <ul className="mt-1 flex flex-col gap-0.5">
            {impact.eventCount > 0 ? (
              <li>{t("common.deletionImpact.events", { count: impact.eventCount })}</li>
            ) : null}
            {impact.deliveryCount > 0 ? (
              <li>{t("common.deletionImpact.deliveries", { count: impact.deliveryCount })}</li>
            ) : null}
            {impact.attemptCount > 0 ? (
              <li>{t("common.deletionImpact.attempts", { count: impact.attemptCount })}</li>
            ) : null}
            {impact.oncallPingCount > 0 ? (
              <li>{t("common.deletionImpact.oncallPings", { count: impact.oncallPingCount })}</li>
            ) : null}
          </ul>
        </AlertDescription>
      </Alert>
      <label className="flex items-start gap-2 text-xs">
        <Checkbox
          checked={confirmed}
          className="mt-0.5"
          onCheckedChange={(checked: boolean) => onConfirmedChange(checked)}
        />
        <span>{t("common.deletionImpact.confirm")}</span>
      </label>
    </div>
  );
}
