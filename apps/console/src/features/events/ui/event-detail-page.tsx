import { RiArrowLeftLine, RiErrorWarningLine } from "@remixicon/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { PageToolbar } from "#/components/common/page-toolbar";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { buttonVariants } from "#/components/ui/button";
import type { EventDetailData } from "#/features/events/ui/event-detail-types";
import { EventDetailView } from "#/features/events/ui/event-detail-view";
import { EventEvidenceDownload } from "#/features/events/ui/event-evidence-download";
import { EventReplayAction } from "#/features/events/ui/event-replay-action";
import { eventDetailQueryOptions } from "#/features/operations/api/operations.queries";
import { SuppressionFromEventDialog } from "#/features/suppressions/ui/suppression-from-event-dialog";
import { useTranslations } from "#/i18n/use-i18n";
import { cn } from "#/lib/utils";
import { DashboardContentLayout } from "#/shell/dashboard-layout";

export function EventDetailPage({ eventId }: { eventId: string }) {
  const t = useTranslations();
  const { data: detail } = useSuspenseQuery(eventDetailQueryOptions(eventId));

  return (
    <DashboardContentLayout
      main={
        <>
          <EventDetailPageToolbar eventId={eventId} detail={detail} />
          {/*
            Narrow viewports stack the summary and tabs at natural height and
            scroll here: the summary alone can exceed the remaining viewport,
            and a `flex-1 overflow-hidden` section then squeezed every tab panel
            down to a few pixels. Desktop keeps the full-height layout with
            per-panel internal scrolling.
          */}
          {detail ? (
            <section className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
              <EventDetailView detail={detail} />
            </section>
          ) : (
            <Alert variant="destructive">
              <RiErrorWarningLine aria-hidden />
              <AlertTitle>{t("events.detail.notFoundTitle")}</AlertTitle>
              <AlertDescription>{t("events.detail.notFoundDescription")}</AlertDescription>
            </Alert>
          )}
        </>
      }
    />
  );
}

function EventDetailPageToolbar({
  eventId,
  detail,
}: {
  eventId: string;
  detail: EventDetailData | null;
}) {
  const t = useTranslations();

  return (
    <PageToolbar
      title={t("events.detail.title")}
      description={t("events.detail.description")}
      badge={eventId}
      actions={
        <>
          {detail ? (
            <SuppressionFromEventDialog event={detail.event} source={detail.source} />
          ) : null}
          {detail ? <EventEvidenceDownload detail={detail} /> : null}
          <EventReplayAction eventId={eventId} disabled={detail === null} />
          <Link
            to="/events"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit")}
          >
            <RiArrowLeftLine data-icon="inline-start" aria-hidden />
            {t("events.detail.back")}
          </Link>
        </>
      }
    />
  );
}
