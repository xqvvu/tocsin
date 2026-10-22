import { RiShieldCheckLine } from "@remixicon/react";
import * as React from "react";

import type { RouteDefinition } from "@tocsin/core";

import { IconTooltip } from "#/components/common/icon-tooltip";
import { Button } from "#/components/ui/button";
import { Dialog, DialogTrigger } from "#/components/ui/dialog";
import { SuppressionFromRouteDialogContent } from "#/features/suppressions/ui/suppression-from-route-dialog-content";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Silences one route from its row, without leaving the routing page.
 *
 * The form is prefilled with the route's rule and its targets: the operator
 * mutes what this route would deliver, while every other route keeps working.
 * The window and any additional narrowing conditions stay editable because a
 * suppression outlives the incident that prompted it.
 */
export function SuppressionFromRouteDialog({
  route,
  disabled = false,
}: {
  route: RouteDefinition;
  disabled?: boolean;
}) {
  const t = useTranslations();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const actionLabel = t("routing.table.actions.silenceTitle", { routeName: route.name });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) {
          setOpen(nextOpen);
        }
      }}
    >
      <IconTooltip label={actionLabel}>
        <DialogTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={disabled || pending}
              aria-label={actionLabel}
            />
          }
        >
          <RiShieldCheckLine data-icon="inline-start" aria-hidden />
        </DialogTrigger>
      </IconTooltip>

      {open ? (
        <SuppressionFromRouteDialogContent
          route={route}
          pending={pending}
          onPendingChange={setPending}
          onSaved={() => setOpen(false)}
        />
      ) : null}
    </Dialog>
  );
}
