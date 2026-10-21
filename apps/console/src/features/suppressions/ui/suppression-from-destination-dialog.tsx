import { RiShieldCheckLine } from "@remixicon/react";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";

import type { DestinationListItem } from "@tocsin/core";

import { ConfigurationDialogContent } from "#/components/common/configuration-dialog-content";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { Skeleton } from "#/components/ui/skeleton";
import { destinationsQueryOptions } from "#/features/destinations/api/destination.queries";
import { sourcesQueryOptions } from "#/features/sources/api/source.queries";
import { useSuppressionMutations } from "#/features/suppressions/api/suppression.mutations";
import { suppressionDefaultsFromDestination } from "#/features/suppressions/model/suppression-form";
import {
  CreateSuppressionForm,
  type SuppressionFormSubmission,
} from "#/features/suppressions/ui/suppression-forms";
import { fallbackTimeZone } from "#/i18n/time-zone";
import { useTimeZone, useTranslations } from "#/i18n/use-i18n";

/**
 * Silences one notification target from its row, without leaving the
 * destinations list.
 *
 * The form is prefilled with `matcher.destinationIds = [destination.id]` only:
 * the operator is muting this target for everything it receives, while every
 * other destination keeps delivering. The window and any additional narrowing
 * conditions stay editable because a suppression outlives the incident that
 * prompted it.
 *
 * The dialog body mounts only while open, so rendering a destinations table
 * does not require query context or fetch the option lists up front.
 */
export function SuppressionFromDestinationDialog({
  destination,
  disabled = false,
}: {
  destination: DestinationListItem;
  disabled?: boolean;
}) {
  const t = useTranslations();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const actionLabel = t("destinations.table.actions.silenceTitle", { name: destination.name });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) {
          setOpen(nextOpen);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={disabled || pending}
            title={actionLabel}
            aria-label={actionLabel}
          />
        }
      >
        <RiShieldCheckLine data-icon="inline-start" aria-hidden />
      </DialogTrigger>

      {open ? (
        <SuppressionFromDestinationDialogContent
          destination={destination}
          pending={pending}
          onPendingChange={setPending}
          onSaved={() => setOpen(false)}
        />
      ) : null}
    </Dialog>
  );
}

function SuppressionFromDestinationDialogContent({
  destination,
  pending,
  onPendingChange,
  onSaved,
}: {
  destination: DestinationListItem;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const timeZone = useTimeZone() ?? fallbackTimeZone;
  const { createSuppression, invalidateSuppressions } = useSuppressionMutations();
  const sourcesQuery = useQuery(sourcesQueryOptions());
  const destinationsQuery = useQuery(destinationsQueryOptions());
  const loadError = sourcesQuery.error ?? destinationsQuery.error;
  const ready = sourcesQuery.data !== undefined && destinationsQuery.data !== undefined;

  // Built on every render, but the form only mounts once its option lists are
  // ready, so the default window reflects the moment the dialog opened.
  const defaults = suppressionDefaultsFromDestination({
    name: t("suppressions.fromDestination.nameTemplate", { name: destination.name }),
    destinationId: destination.id,
    timeZone,
  });

  // The row's destination may be missing from the fetched list if it was
  // deleted concurrently; keep it selectable so the prefilled matcher and the
  // operator's choice stay visible.
  const destinations = React.useMemo(() => {
    const list = destinationsQuery.data ?? [];

    return list.some((candidate) => candidate.id === destination.id)
      ? list
      : [destination, ...list];
  }, [destination, destinationsQuery.data]);

  async function handleSubmit(input: SuppressionFormSubmission): Promise<void> {
    onPendingChange(true);

    try {
      await createSuppression(input);
      await invalidateSuppressions();
      toast.success(t("suppressions.fromDestination.toast.success"));
      onSaved();
    } catch (error) {
      toast.error(t("suppressions.fromDestination.toast.failed"), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      onPendingChange(false);
    }
  }

  return (
    <ConfigurationDialogContent>
      <DialogHeader className="shrink-0 pr-8">
        <DialogTitle>{t("suppressions.fromDestination.title")}</DialogTitle>
        <DialogDescription>{t("suppressions.fromDestination.description")}</DialogDescription>
      </DialogHeader>
      <p className="text-muted-foreground shrink-0 font-mono text-[11px] wrap-break-word">
        {t("suppressions.fromDestination.context", { destinationName: destination.name })}
      </p>

      {loadError ? (
        <p className="text-destructive text-xs">{t("suppressions.fromDestination.loadFailed")}</p>
      ) : ready ? (
        <CreateSuppressionForm
          showHeader={false}
          sources={sourcesQuery.data ?? []}
          destinations={destinations}
          layout="dialog"
          pending={pending}
          defaultValues={defaults}
          resetOnSubmit={false}
          onSubmit={(input) => void handleSubmit(input)}
        />
      ) : (
        <div className="flex flex-col gap-2 py-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
          <p className="text-muted-foreground text-xs">
            {t("suppressions.fromDestination.loading")}
          </p>
        </div>
      )}
    </ConfigurationDialogContent>
  );
}
