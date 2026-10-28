import { RiErrorWarningLine } from "@remixicon/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "#/components/ui/empty";
import { Skeleton } from "#/components/ui/skeleton";
import { EventFingerprintChanges } from "#/features/events/ui/event-fingerprint-changes";
import { EventFingerprintOccurrencesTable } from "#/features/events/ui/event-fingerprint-occurrences-table";
import { eventFingerprintContextQueryOptions } from "#/features/operations/api/operations.queries";
import { OperationTimestamp } from "#/features/operations/ui/operation-timestamp";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Recurrence view for one event: has this fingerprint fired before, and what
 * is different this time?
 *
 * A separate read rather than part of `getEventDetail`: the tab is the only
 * consumer, and Radix unmounts inactive tab content, so a detail page that
 * never opens this tab pays for neither the page query nor the count. The
 * server has already redacted titles, messages and labels, so this component
 * renders strings as they arrive.
 */
export function EventFingerprintContextTab({
  eventId,
  sourceId,
}: {
  eventId: string;
  /** The source this event arrived on; the list link stays same-source. */
  sourceId: string;
}) {
  const t = useTranslations();
  const context = useQuery(eventFingerprintContextQueryOptions(eventId));

  if (context.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (context.isError) {
    return (
      <Alert variant="destructive">
        <RiErrorWarningLine aria-hidden />
        <AlertTitle>{t("events.detail.fingerprint.loadFailedTitle")}</AlertTitle>
        <AlertDescription>{t("events.detail.fingerprint.loadFailedDescription")}</AlertDescription>
      </Alert>
    );
  }

  if (!context.data) {
    return (
      <p className="text-muted-foreground text-xs">{t("events.detail.fingerprint.notFound")}</p>
    );
  }

  const data = context.data;

  if (data.earlierCount === 0 || data.previous === null) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t("events.detail.fingerprint.firstOccurrenceTitle")}</EmptyTitle>
          <EmptyDescription>
            {t("events.detail.fingerprint.firstOccurrenceDescription")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto">
      <section className="border-border bg-background flex flex-wrap items-baseline gap-x-2 gap-y-1 border p-3">
        <p className="text-sm font-medium">
          {t("events.detail.fingerprint.earlierCount", { count: data.earlierCount })}
        </p>
        <p className="text-muted-foreground flex items-baseline gap-1 text-xs">
          <span>{t("events.detail.fingerprint.latestOccurrence")}</span>
          <OperationTimestamp format="dateTime" value={data.previous.receivedAt} />
        </p>
        {/*
          The table below stops at five rows, so the count in this header was a
          dead end: an operator who needed the sixth occurrence had to retype
          the fingerprint into the search box, where a substring match also
          pulls in unrelated alerts. The list link carries the same-source and
          exact-fingerprint rule the recurrence query already uses.
        */}
        <Link
          to="/events"
          search={{ sourceId, fingerprint: data.fingerprint }}
          className="ml-auto text-xs underline-offset-2 hover:underline"
        >
          {t("events.detail.fingerprint.viewAll", { count: data.earlierCount + 1 })}
        </Link>
      </section>

      <EventFingerprintChanges fieldChanges={data.fieldChanges} labelChanges={data.labelChanges} />

      <EventFingerprintOccurrencesTable occurrences={data.recent} />
    </div>
  );
}
