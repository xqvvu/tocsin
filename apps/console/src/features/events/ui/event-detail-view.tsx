import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { EventDetailDeliveriesTable } from "#/features/events/ui/event-detail-deliveries-table";
import { EventDetailRouteGaps } from "#/features/events/ui/event-detail-route-gaps";
import { EventDetailRouteMatchesTable } from "#/features/events/ui/event-detail-route-matches-table";
import { getEventDeliveryStats } from "#/features/events/ui/event-detail-stats";
import { EventDetailSummary } from "#/features/events/ui/event-detail-summary";
import type { EventDetailData } from "#/features/events/ui/event-detail-types";
import { EventFingerprintContextTab } from "#/features/events/ui/event-fingerprint-context-tab";
import { EventNormalizedTab } from "#/features/events/ui/event-normalized-tab";
import { EventParseFailureNotice } from "#/features/events/ui/event-parse-failure-notice";
import { EventRawTab } from "#/features/events/ui/event-raw-tab";
import { useTranslations } from "#/i18n/use-i18n";

export function EventDetailView({ detail }: { detail: EventDetailData }) {
  const t = useTranslations();
  const matchedRouteCount = detail.routeMatches.filter((match) => match.matched).length;
  const deliveryStats = getEventDeliveryStats(detail.deliveries);

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-hidden lg:h-full">
      <EventDetailSummary
        detail={detail}
        matchedRouteCount={matchedRouteCount}
        deliveryStats={deliveryStats}
      />

      {/*
        Above the tabs on purpose: when intake could not parse the payload,
        every tab below describes an event that never existed upstream. The
        notice is the first thing the operator needs to read.
      */}
      <EventParseFailureNotice providerMetadata={detail.event.providerMetadata} />

      <Tabs
        defaultValue="normalized"
        className="border-border bg-card min-h-0 flex-1 overflow-hidden border"
      >
        <div className="border-border shrink-0 border-b p-3">
          {/*
            Below `lg` the five labels no longer fit the default English locale
            (they need ~440px at a 390px viewport), and horizontal scrolling hid
            the last tabs with no affordance. Wrapping keeps every tab visible;
            the zh-Hans labels already fit on one row, so it is a no-op there.
            `TabsList` grows with the wrapped rows because its height is a
            minimum rather than a fixed h-8.
          */}
          <TabsList
            variant="bordered"
            className="w-full justify-start overflow-x-auto overflow-y-hidden max-lg:flex-wrap max-lg:overflow-visible"
          >
            <TabsTrigger value="normalized">{t("events.detail.tabs.normalized")}</TabsTrigger>
            <TabsTrigger value="matches">{t("events.detail.tabs.matches")}</TabsTrigger>
            <TabsTrigger value="deliveries">{t("events.detail.tabs.deliveries")}</TabsTrigger>
            <TabsTrigger value="fingerprint">{t("events.detail.tabs.fingerprint")}</TabsTrigger>
            <TabsTrigger value="raw">{t("events.detail.tabs.raw")}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="normalized" className="min-h-0 overflow-hidden p-3">
          <EventNormalizedTab detail={detail} />
        </TabsContent>

        <TabsContent value="matches" className="min-h-0 overflow-hidden p-3">
          {/*
            Both live in one tab on purpose: "did it match" and "then what
            happened" are one question to an operator, and splitting them
            across tabs forces them to cross-reference by memory.
          */}
          <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto">
            <EventDetailRouteMatchesTable
              eventId={detail.event.id}
              matches={detail.routeMatches}
              matchedRouteCount={matchedRouteCount}
              provenance={detail.routeMatchesProvenance}
              deliveries={detail.deliveries}
            />
            {detail.routeMatchGaps.length > 0 ? (
              <EventDetailRouteGaps gaps={detail.routeMatchGaps} />
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="deliveries" className="min-h-0 overflow-hidden p-3">
          <EventDetailDeliveriesTable deliveries={detail.deliveries} />
        </TabsContent>

        <TabsContent value="fingerprint" className="min-h-0 overflow-hidden p-3">
          {/*
            Queried only while this tab is mounted: Radix unmounts inactive
            content, so opening an event does not fetch its recurrence context
            unless the operator asks for it.
          */}
          <EventFingerprintContextTab eventId={detail.event.id} sourceId={detail.event.sourceId} />
        </TabsContent>

        <TabsContent value="raw" className="min-h-0 overflow-hidden p-3">
          <EventRawTab detail={detail} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
