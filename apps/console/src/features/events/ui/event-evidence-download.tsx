import { RiDownloadLine } from "@remixicon/react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import type { EventDetailData } from "#/features/events/ui/event-detail-types";
import {
  buildEventEvidenceBundle,
  evidenceBundleFilename,
  serializeEvidenceBundle,
} from "#/features/operations/model/evidence-bundle";
import { useTranslations } from "#/i18n/use-i18n";
import { downloadTextFile } from "#/lib/browser";

/**
 * Exports the redacted event detail document for an incident ticket.
 *
 * The bundle is built from data the page already holds, so the download adds
 * no request and cannot widen what the operator can see.
 */
export function EventEvidenceDownload({ detail }: { detail: EventDetailData }) {
  const t = useTranslations();

  function handleDownload(): void {
    const bundle = buildEventEvidenceBundle(detail);

    downloadTextFile({
      filename: evidenceBundleFilename(bundle),
      text: serializeEvidenceBundle(bundle),
      type: "application/json;charset=utf-8",
    });
    toast.success(t("events.detail.evidence.toast.success"));
  }

  return (
    <Button variant="outline" size="sm" onClick={handleDownload}>
      <RiDownloadLine data-icon="inline-start" aria-hidden />
      {t("events.detail.evidence.action")}
    </Button>
  );
}
