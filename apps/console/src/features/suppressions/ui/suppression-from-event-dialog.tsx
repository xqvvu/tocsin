import { RiShieldCheckLine } from "@remixicon/react";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";

import type { EventRecord, SourceSummary } from "@tocsin/core";

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
import { suppressionDefaultsFromEvent } from "#/features/suppressions/model/suppression-form";
import {
  CreateSuppressionForm,
  type SuppressionFormSubmission,
} from "#/features/suppressions/ui/suppression-forms";
import { useTranslations } from "#/i18n/use-i18n";

/** Keeps the generated rule name readable in the suppressions table. */
const MAX_NAME_TITLE_LENGTH = 80;

/**
 * Silences one event's fingerprint without leaving the event detail page.
 *
 * The form is prefilled with the event's source and fingerprint; the operator
 * still confirms the window and can widen or narrow the conditions, because a
 * suppression outlives the event that prompted it.
 */
export function SuppressionFromEventDialog({
  event,
  source,
  disabled = false,
}: {
  event: EventRecord;
  source: SourceSummary;
  disabled?: boolean;
}) {
  const t = useTranslations();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const { createSuppression, invalidateSuppressions } = useSuppressionMutations();
  const sourcesQuery = useQuery({ ...sourcesQueryOptions(), enabled: open });
  const destinationsQuery = useQuery({ ...destinationsQueryOptions(), enabled: open });
  const loadError = sourcesQuery.error ?? destinationsQuery.error;
  const ready = sourcesQuery.data !== undefined && destinationsQuery.data !== undefined;

  // Built on every render, but the form only mounts once its option lists are
  // ready, so the default window reflects the moment the dialog opened rather
  // than the moment this long-lived detail page mounted.
  const defaults = suppressionDefaultsFromEvent({
    name: t("suppressions.fromEvent.nameTemplate", {
      title: clipTitle(event.normalized.title),
    }),
    sourceId: source.id,
    fingerprint: event.normalized.fingerprint,
  });

  // The event's source may be missing from the fetched list if it was deleted
  // after intake; keep it selectable so the prefilled matcher stays visible.
  const sources = React.useMemo(() => {
    const list = sourcesQuery.data ?? [];

    return list.some((candidate) => candidate.id === source.id) ? list : [source, ...list];
  }, [source, sourcesQuery.data]);

  async function handleSubmit(input: SuppressionFormSubmission): Promise<void> {
    setPending(true);

    try {
      await createSuppression(input);
      await invalidateSuppressions();
      toast.success(t("suppressions.fromEvent.toast.success"));
      setOpen(false);
    } catch (error) {
      toast.error(t("suppressions.fromEvent.toast.failed"), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPending(false);
    }
  }

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
            variant="outline"
            size="sm"
            disabled={disabled || pending}
            title={t("suppressions.fromEvent.action")}
            className="w-fit"
          />
        }
      >
        <RiShieldCheckLine data-icon="inline-start" aria-hidden />
        {t("suppressions.fromEvent.action")}
      </DialogTrigger>

      <ConfigurationDialogContent>
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>{t("suppressions.fromEvent.title")}</DialogTitle>
          <DialogDescription>{t("suppressions.fromEvent.description")}</DialogDescription>
        </DialogHeader>
        <p className="text-muted-foreground shrink-0 font-mono text-[11px] wrap-break-word">
          {t("suppressions.fromEvent.context", {
            sourceName: source.name,
            fingerprint: event.normalized.fingerprint,
          })}
        </p>

        {loadError ? (
          <p className="text-destructive text-xs">{t("suppressions.fromEvent.loadFailed")}</p>
        ) : ready ? (
          <CreateSuppressionForm
            showHeader={false}
            sources={sources}
            destinations={destinationsQuery.data ?? []}
            layout="dialog"
            pending={pending}
            defaultValues={defaults}
            onSubmit={(input) => void handleSubmit(input)}
          />
        ) : (
          <div className="flex flex-col gap-2 py-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
            <p className="text-muted-foreground text-xs">{t("suppressions.fromEvent.loading")}</p>
          </div>
        )}
      </ConfigurationDialogContent>
    </Dialog>
  );
}

function clipTitle(title: string): string {
  const trimmed = title.trim();

  return trimmed.length > MAX_NAME_TITLE_LENGTH
    ? `${trimmed.slice(0, MAX_NAME_TITLE_LENGTH - 1)}…`
    : trimmed;
}
