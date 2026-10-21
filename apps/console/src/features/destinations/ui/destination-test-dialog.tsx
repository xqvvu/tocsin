import { RiPlayLine } from "@remixicon/react";
import * as React from "react";

import type { DestinationTestResult } from "@tocsin/core";

import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import type { DestinationPreviewSampleEvent } from "#/features/destinations/ui/destination-notices";
import { useTranslations } from "#/i18n/use-i18n";

/** Value of the "built-in sample" entry in the test sample picker. */
const BUILT_IN_SAMPLE_VALUE = "built-in";

/**
 * Confirms an outbound test send and lets the operator render it from a real
 * Event instead of the synthetic sample. The dialog stays open on failure so
 * the operator can retry without reselecting the sample.
 */
export function DestinationTestDialog({
  destinationName,
  open,
  onOpenChange,
  sampleEvents = [],
  sampleEventsPending = false,
  sampleEventsError = false,
  onSend,
}: {
  destinationName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sampleEvents?: readonly DestinationPreviewSampleEvent[];
  sampleEventsPending?: boolean;
  sampleEventsError?: boolean;
  /** Resolves `null` when the send did not complete, so the dialog stays open. */
  onSend: (sampleEventId: string | null) => Promise<DestinationTestResult | null>;
}) {
  const t = useTranslations();
  const [sampleEventId, setSampleEventId] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const sampleItems = React.useMemo(
    () => [
      { value: BUILT_IN_SAMPLE_VALUE, label: t("destinations.notice.previewSampleBuiltIn") },
      ...sampleEvents.map((event) => ({
        value: event.id,
        label: `${event.title} · ${event.sourceName}`,
      })),
    ],
    [sampleEvents, t],
  );

  async function send() {
    setSending(true);

    try {
      const result = await onSend(sampleEventId);

      if (result) {
        onOpenChange(false);
      }
    } catch {
      // The page reports request failures in a toast; keep the dialog open so
      // the operator can retry with the same sample.
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!sending) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="pr-8">
          <DialogTitle>
            {t("destinations.test.confirmTitle", { name: destinationName })}
          </DialogTitle>
          <DialogDescription>{t("destinations.test.confirmDescription")}</DialogDescription>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-2 text-xs">
            <label className="text-muted-foreground" htmlFor="destination-test-sample">
              {t("destinations.test.sampleLabel")}
            </label>
            <Select
              id="destination-test-sample"
              items={sampleItems}
              value={sampleEventId ?? BUILT_IN_SAMPLE_VALUE}
              disabled={sending || sampleEventsPending}
              onValueChange={(value) => {
                setSampleEventId(value === BUILT_IN_SAMPLE_VALUE ? null : String(value));
              }}
            >
              <SelectTrigger size="sm" className="w-full sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {sampleItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {sampleEventsError ? (
              <span className="text-destructive">
                {t("destinations.notice.previewSampleLoadFailed")}
              </span>
            ) : !sampleEventsPending && sampleEvents.length === 0 ? (
              <span className="text-muted-foreground">
                {t("destinations.notice.previewSampleEmpty")}
              </span>
            ) : null}
          </div>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={sending}
            onClick={() => onOpenChange(false)}
          >
            {t("destinations.form.cancel")}
          </Button>
          <Button type="button" disabled={sending} onClick={() => void send()}>
            <RiPlayLine data-icon="inline-start" aria-hidden />
            {sending ? t("destinations.test.sending") : t("destinations.test.confirmAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
