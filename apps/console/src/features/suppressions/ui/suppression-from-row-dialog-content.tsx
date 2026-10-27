import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";

import type { DestinationListItem, Suppression } from "@tocsin/core";

import { ConfigurationDialogContent } from "#/components/common/configuration-dialog-content";
import { DialogDescription, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import { Skeleton } from "#/components/ui/skeleton";
import { destinationsQueryOptions } from "#/features/destinations/api/destination.queries";
import { sourcesQueryOptions } from "#/features/sources/api/source.queries";
import { useSuppressionMutations } from "#/features/suppressions/api/suppression.mutations";
import type { SuppressionFormValues } from "#/features/suppressions/model/suppression-form";
import { SuppressionCreatedNotice } from "#/features/suppressions/ui/suppression-created-notice";
import {
  CreateSuppressionForm,
  type SuppressionFormSubmission,
} from "#/features/suppressions/ui/suppression-forms";
import { fallbackTimeZone } from "#/i18n/time-zone";
import { useTimeZone } from "#/i18n/use-i18n";

export interface SuppressionFromRowDialogCopy {
  title: string;
  description: string;
  context: string;
  loadFailed: string;
  loading: string;
  toastSuccess: string;
  toastFailed: string;
}

/**
 * The open-state body shared by the list rows' one-click silence dialogs.
 *
 * A destination row pins its own target; a route row pins the route's rule and
 * targets. Everything else — loading the option lists, prefilling the window,
 * saving, and keeping the dialog open on failure — is identical, so both rows
 * mount this component instead of copying it.
 *
 * Mounted only while the dialog is open on purpose: the list renders one per
 * row, and closed dialogs must not require query context or fetch the option
 * lists.
 */
export function SuppressionFromRowDialogContent({
  copy,
  buildDefaults,
  pinnedDestination,
  pending,
  onPendingChange,
  onSaved,
}: {
  copy: SuppressionFromRowDialogCopy;
  /** Built on every render so the default window reflects the opening moment. */
  buildDefaults: (timeZone: string) => SuppressionFormValues;
  /**
   * A target the fetched list no longer contains (deleted concurrently) stays
   * selectable, so the prefilled matcher stays visible instead of silently
   * dropping the operator's scope.
   */
  pinnedDestination?: DestinationListItem;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onSaved: () => void;
}) {
  const timeZone = useTimeZone() ?? fallbackTimeZone;
  const [created, setCreated] = React.useState<Suppression | null>(null);
  const { createSuppression, invalidateSuppressions } = useSuppressionMutations();
  const sourcesQuery = useQuery(sourcesQueryOptions());
  const destinationsQuery = useQuery(destinationsQueryOptions());
  const loadError = sourcesQuery.error ?? destinationsQuery.error;
  const ready = sourcesQuery.data !== undefined && destinationsQuery.data !== undefined;
  const defaults = buildDefaults(timeZone);

  const destinations = React.useMemo(() => {
    const list = destinationsQuery.data ?? [];

    if (!pinnedDestination || list.some((candidate) => candidate.id === pinnedDestination.id)) {
      return list;
    }

    return [pinnedDestination, ...list];
  }, [destinationsQuery.data, pinnedDestination]);

  async function handleSubmit(input: SuppressionFormSubmission): Promise<void> {
    onPendingChange(true);

    try {
      const suppression = await createSuppression(input);
      await invalidateSuppressions();
      toast.success(copy.toastSuccess);
      // Keep the dialog open on the created rule: the operator triaging here
      // needs the generated window and a way back to the rule, not a toast
      // that disappears before they can check either.
      setCreated(suppression);
    } catch (error) {
      toast.error(copy.toastFailed, {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      onPendingChange(false);
    }
  }

  return (
    <ConfigurationDialogContent>
      <DialogHeader className="shrink-0 pr-8">
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
      </DialogHeader>
      <p className="text-muted-foreground shrink-0 font-mono text-[11px] wrap-break-word">
        {copy.context}
      </p>

      {created ? (
        <SuppressionCreatedNotice suppression={created} onDone={onSaved} />
      ) : loadError ? (
        <p className="text-destructive text-xs">{copy.loadFailed}</p>
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
          <p className="text-muted-foreground text-xs">{copy.loading}</p>
        </div>
      )}
    </ConfigurationDialogContent>
  );
}
