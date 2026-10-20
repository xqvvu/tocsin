import { RiDownloadLine } from "@remixicon/react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";
import {
  buildDeliveryEvidenceBundle,
  evidenceBundleFilename,
  serializeEvidenceBundle,
} from "#/features/operations/model/evidence-bundle";
import { useTranslations } from "#/i18n/use-i18n";
import { downloadTextFile } from "#/lib/browser";

/**
 * Exports the redacted delivery detail document: job, event, destination
 * metadata, rendered payload, attempts, and pings. Same rule as the event
 * export — the file is a projection of what the page already renders.
 */
export function DeliveryEvidenceDownload({ detail }: { detail: DeliveryDetailData }) {
  const t = useTranslations();

  function handleDownload(): void {
    const bundle = buildDeliveryEvidenceBundle(detail);

    downloadTextFile({
      filename: evidenceBundleFilename(bundle),
      text: serializeEvidenceBundle(bundle),
      type: "application/json;charset=utf-8",
    });
    toast.success(t("deliveries.detail.evidence.toast.success"));
  }

  return (
    <Button variant="outline" size="sm" onClick={handleDownload}>
      <RiDownloadLine data-icon="inline-start" aria-hidden />
      {t("deliveries.detail.evidence.action")}
    </Button>
  );
}
