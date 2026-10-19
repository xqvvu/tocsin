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
import {
  suppressionDefaultsFromEvent,
  suppressionDefaultsFromLabel,
} from "#/features/suppressions/model/suppression-form";
import {
  CreateSuppressionForm,
  type SuppressionFormSubmission,
} from "#/features/suppressions/ui/suppression-forms";
import { useTranslations } from "#/i18n/use-i18n";

/** Keeps the generated rule name readable in the suppressions table. */
const MAX_NAME_TITLE_LENGTH = 80;

/**
 * Silences one event's fingerprint, or one of its label values, without
 * leaving the event detail page.
 *
 * The form is prefilled with the event's source plus either the fingerprint or
 * the clicked label; the operator still confirms the window and can widen or
 * narrow the conditions, because a suppression outlives the event that
 * prompted it.
 */
export function SuppressionFromEventDialog({
  event,
  source,
  label,
  disabled = false,
  disabledReason,
}: {
  event: EventRecord;
  source: SourceSummary;
  /** When set, the form silences this label value instead of the fingerprint. */
  label?: { key: string; value: string };
  disabled?: boolean;
  /** Replaces the action title when disabled, to explain why it is unavailable. */
  disabledReason?: string;
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
  const name = t("suppressions.fromEvent.nameTemplate", {
    title: clipTitle(event.normalized.title),
  });
  const defaults = label
    ? suppressionDefaultsFromLabel({ name, sourceId: source.id, label })
    : suppressionDefaultsFromEvent({
        name,
        sourceId: source.id,
        fingerprint: event.normalized.fingerprint,
      });
  const actionLabel = label
    ? t("suppressions.fromLabel.actionFor", {
        labelKey: label.key,
        labelValue: label.value,
      })
    : t("suppressions.fromEvent.action");
  const actionTitle = disabled && disabledReason ? disabledReason : actionLabel;

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
            size={label ? "icon-xs" : "sm"}
            disabled={disabled || pending}
            title={actionTitle}
            aria-label={label ? actionTitle : undefined}
            className={label ? "shrink-0" : "w-fit"}
          />
        }
      >
        <RiShieldCheckLine data-icon="inline-start" aria-hidden />
        {label ? null : actionLabel}
      </DialogTrigger>

      <ConfigurationDialogContent>
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>
            {label ? t("suppressions.fromLabel.title") : t("suppressions.fromEvent.title")}
          </DialogTitle>
          <DialogDescription>
            {label
              ? t("suppressions.fromLabel.description")
              : t("suppressions.fromEvent.description")}
          </DialogDescription>
        </DialogHeader>
        <p className="text-muted-foreground shrink-0 font-mono text-[11px] wrap-break-word">
          {label
            ? t("suppressions.fromLabel.context", {
                sourceName: source.name,
                labelKey: label.key,
                labelValue: label.value,
              })
            : t("suppressions.fromEvent.context", {
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
