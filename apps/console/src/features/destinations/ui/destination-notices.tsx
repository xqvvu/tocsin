import * as React from "react";
import { toast } from "sonner";

import type { DestinationPreviewSample, TemplateDiagnostic } from "@tocsin/core";

import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from "#/components/ai-elements/code-block";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import type {
  DestinationPreviewNotice,
  DestinationTestNotice,
} from "#/features/destinations/model/destination-types";
import { TemplateDiagnosticsList } from "#/features/destinations/ui/template-diagnostics-list";
import { useOperationDateFormatter } from "#/features/operations/model/operation-format";
import { useTranslations } from "#/i18n/use-i18n";

type TranslationFn = ReturnType<typeof useTranslations>;

export function showDestinationTestToast(notice: DestinationTestNotice, t: TranslationFn) {
  const title = notice.success
    ? t("destinations.notice.testAcceptedTitle", { name: notice.destination.name })
    : t("destinations.notice.testFailedTitle", { name: notice.destination.name });
  const message = notice.success
    ? notice.statusCode
      ? t("destinations.notice.testAcceptedWithStatus", { statusCode: notice.statusCode })
      : t("destinations.notice.testAccepted")
    : (notice.error ?? t("destinations.notice.testRejected"));
  const description = (
    <div className="flex max-w-[min(28rem,calc(100vw-3rem))] flex-col gap-2">
      <span>{message}</span>
      {notice.responseBody ? (
        <pre className="bg-muted text-muted-foreground max-h-28 overflow-auto p-2 font-mono text-[11px] whitespace-pre-wrap">
          {notice.responseBody}
        </pre>
      ) : null}
    </div>
  );

  if (notice.success) {
    toast.success(title, { description });
    return;
  }

  toast.error(title, { description });
}

/** Value of the "built-in sample" entry in the preview sample picker. */
const BUILT_IN_SAMPLE_VALUE = "built-in";

export interface DestinationPreviewSampleEvent {
  id: string;
  title: string;
  sourceName: string;
  receivedAt: string;
}

export function DestinationPreviewDialog({
  notice,
  open,
  onOpenChange,
  sampleEvents = [],
  sampleEventsPending = false,
  sampleEventsError = false,
  sampleChangeDisabled = false,
  onSampleChange,
}: {
  notice: DestinationPreviewNotice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Recent events the operator can use as a real sample. */
  sampleEvents?: readonly DestinationPreviewSampleEvent[];
  sampleEventsPending?: boolean;
  sampleEventsError?: boolean;
  sampleChangeDisabled?: boolean;
  /** Omit to keep the dialog read-only; provided enables the sample picker. */
  onSampleChange?: (sampleEventId: string | null) => void;
}) {
  const t = useTranslations();
  const previewTabs = React.useMemo(() => createPreviewTabs(notice, t), [notice, t]);
  const selectedSampleValue =
    notice?.sample.kind === "historical_event" ? notice.sample.eventId : BUILT_IN_SAMPLE_VALUE;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(760px,calc(100dvh-2rem))] overflow-hidden sm:max-w-4xl">
        <DialogHeader className="pr-8">
          <DialogTitle>
            {notice ? t("destinations.notice.previewTitle", { name: notice.destination.name }) : ""}
          </DialogTitle>
          <DialogDescription>{t("destinations.notice.previewDescription")}</DialogDescription>
          {onSampleChange && notice ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-2 text-xs">
              <label className="text-muted-foreground" htmlFor="destination-preview-sample">
                {t("destinations.notice.previewSampleLabel")}
              </label>
              <Select
                id="destination-preview-sample"
                items={sampleItems}
                value={selectedSampleValue}
                disabled={sampleChangeDisabled || sampleEventsPending}
                onValueChange={(value) => {
                  onSampleChange(value === BUILT_IN_SAMPLE_VALUE ? null : String(value));
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
              <PreviewSampleSummary sample={notice.sample} />
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
          ) : null}
        </DialogHeader>
        {notice ? (
          <Tabs defaultValue="payload" className="min-h-0">
            <TabsList variant="bordered" className="max-w-full overflow-x-auto">
              {previewTabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {previewTabs.map((tab) => (
              <TabsContent key={tab.value} value={tab.value} className="min-h-0">
                {tab.content}
              </TabsContent>
            ))}
          </Tabs>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PreviewSampleSummary({ sample }: { sample: DestinationPreviewSample }) {
  const t = useTranslations();
  const dateFormatter = useOperationDateFormatter();

  if (sample.kind === "built_in") {
    return (
      <span className="text-muted-foreground">
        {t("destinations.notice.previewSampleBuiltInHint")}
      </span>
    );
  }

  return (
    <span className="text-muted-foreground">
      {t("destinations.notice.previewSampleHistoricalHint", {
        source: sample.source.name,
        receivedAt: sample.receivedAt ? dateFormatter.formatDateTime(sample.receivedAt) : "—",
      })}
    </span>
  );
}

type PreviewTab = {
  value: string;
  label: string;
  content: React.ReactNode;
};

function createPreviewTabs(
  notice: DestinationPreviewNotice | null,
  t: TranslationFn,
): PreviewTab[] {
  if (!notice) {
    return [];
  }

  const jsonTab = (
    value: string,
    label: string,
    filename: string,
    valueJson: unknown,
  ): PreviewTab => ({
    value,
    label,
    content: (
      <PreviewJsonBlock
        filename={filename}
        value={valueJson}
        copyLabel={t("destinations.notice.copyPreviewPayload")}
        t={t}
      />
    ),
  });

  return [
    jsonTab(
      "payload",
      t("destinations.notice.previewTabs.payload"),
      t("destinations.notice.previewPayloadFilename"),
      notice.renderedPayload,
    ),
    ...(notice.normalizedEvent
      ? [
          jsonTab(
            "normalized",
            t("destinations.notice.previewTabs.normalized"),
            t("destinations.notice.previewNormalizedFilename"),
            notice.normalizedEvent,
          ),
        ]
      : []),
    ...(notice.context
      ? [
          jsonTab(
            "context",
            t("destinations.notice.previewTabs.context"),
            t("destinations.notice.previewContextFilename"),
            notice.context,
          ),
        ]
      : []),
    ...(notice.rawPayloadReference
      ? [
          jsonTab(
            "raw",
            t("destinations.notice.previewTabs.raw"),
            t("destinations.notice.previewRawFilename"),
            notice.rawPayloadReference,
          ),
        ]
      : []),
    {
      value: "diagnostics",
      label: t("destinations.notice.previewTabs.diagnostics"),
      content: <PreviewDiagnosticsPanel diagnostics={notice.diagnostics} />,
    },
  ];
}

/** Diagnostics as a list an operator can read, never as a raw JSON blob. */
function PreviewDiagnosticsPanel({ diagnostics }: { diagnostics: readonly TemplateDiagnostic[] }) {
  const t = useTranslations();

  return (
    <div className="border-border max-h-[min(490px,calc(100dvh-16rem))] overflow-auto border p-3">
      {diagnostics.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t("destinations.diagnostics.empty")}</p>
      ) : (
        <TemplateDiagnosticsList diagnostics={diagnostics} />
      )}
    </div>
  );
}

function PreviewJsonBlock({
  filename,
  value,
  copyLabel,
  t,
}: {
  filename: string;
  value: unknown;
  copyLabel: string;
  t: TranslationFn;
}) {
  return (
    <CodeBlock
      code={JSON.stringify(value, null, 2)}
      language="json"
      showLineNumbers
      contentClassName="max-h-[min(490px,calc(100dvh-16rem))]"
    >
      <CodeBlockHeader>
        <CodeBlockTitle>
          <CodeBlockFilename>{filename}</CodeBlockFilename>
        </CodeBlockTitle>
        <CodeBlockActions>
          <CodeBlockCopyButton
            aria-label={copyLabel}
            title={copyLabel}
            onCopy={() => toast.success(t("common.actions.copied"))}
            onError={() => toast.error(t("common.actions.copyFailed"))}
          />
        </CodeBlockActions>
      </CodeBlockHeader>
    </CodeBlock>
  );
}
