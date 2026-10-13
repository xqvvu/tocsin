import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { DeliveryAttemptsTable } from "#/features/deliveries/ui/delivery-attempts-table";
import { DeliveryDetailSummary } from "#/features/deliveries/ui/delivery-detail-summary";
import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";
import { DeliveryJsonBlock } from "#/features/deliveries/ui/delivery-json-block";
import { DeliveryPingsTable } from "#/features/deliveries/ui/delivery-pings-table";
import { DeliverySummaryTab } from "#/features/deliveries/ui/delivery-summary-tab";
import { DeliverySuppressionNotice } from "#/features/deliveries/ui/delivery-suppression-notice";
import { useTranslations } from "#/i18n/use-i18n";

export function DeliveryDetailView({ detail }: { detail: DeliveryDetailData }) {
  const t = useTranslations();

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <DeliveryDetailSummary detail={detail} />

      {detail.job.state === "suppressed" ? <DeliverySuppressionNotice detail={detail} /> : null}

      <Tabs
        defaultValue="summary"
        className="border-border bg-card min-h-0 flex-1 overflow-hidden border"
      >
        <div className="border-border shrink-0 border-b p-3">
          <TabsList
            variant="bordered"
            className="w-full justify-start overflow-x-auto overflow-y-hidden"
          >
            <TabsTrigger value="summary">{t("deliveries.detail.tabs.summary")}</TabsTrigger>
            <TabsTrigger value="payload">{t("deliveries.detail.tabs.payload")}</TabsTrigger>
            <TabsTrigger value="attempts">{t("deliveries.detail.tabs.attempts")}</TabsTrigger>
            <TabsTrigger value="paging">{t("deliveries.detail.tabs.paging")}</TabsTrigger>
            <TabsTrigger value="metadata">{t("deliveries.detail.tabs.metadata")}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="summary" className="min-h-0 overflow-hidden p-3">
          <DeliverySummaryTab detail={detail} />
        </TabsContent>

        <TabsContent value="payload" className="min-h-0 overflow-hidden p-3">
          <DeliveryJsonBlock
            title={t("deliveries.detail.json.renderedPayload")}
            value={detail.renderedPayload ?? {}}
          />
        </TabsContent>

        <TabsContent value="attempts" className="min-h-0 overflow-hidden p-3">
          <DeliveryAttemptsTable attempts={detail.attempts} />
        </TabsContent>

        <TabsContent value="paging" className="min-h-0 overflow-hidden p-3">
          <DeliveryPingsTable pings={detail.pings} />
        </TabsContent>

        <TabsContent value="metadata" className="min-h-0 overflow-hidden p-3">
          <DeliveryJsonBlock
            title={t("deliveries.detail.json.destinationMetadata")}
            value={detail.destinationMetadata}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
