import { RiPlayLine } from "@remixicon/react";
import * as React from "react";

import type { RehearseSourceCommand, SourceRehearsalResult, SourceSummary } from "@tocsin/core";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { parseRehearsalPayload } from "#/features/sources/model/source-rehearsal";
import { SourceRehearsalResultView } from "#/features/sources/ui/source-rehearsal-result";
import { useTranslations } from "#/i18n/use-i18n";
import { cn } from "#/lib/utils";

/**
 * Replays a pasted upstream payload through the Source's parser and the current
 * route rules. The dialog owns the draft; the caller owns the dashboard call so
 * this component stays testable without an oRPC client.
 */
export function SourceRehearsalDialog({
  sources,
  disabled = false,
  onRehearse,
}: {
  sources: SourceSummary[];
  disabled?: boolean;
  onRehearse: (input: RehearseSourceCommand) => Promise<SourceRehearsalResult>;
}) {
  const t = useTranslations();
  const [open, setOpen] = React.useState(false);
  const [sourceId, setSourceId] = React.useState(sources[0]?.id ?? "");
  const [payloadText, setPayloadText] = React.useState("");
  const [payloadInvalid, setPayloadInvalid] = React.useState(false);
  const [requestError, setRequestError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<SourceRehearsalResult | null>(null);
  const [running, setRunning] = React.useState(false);

  // The list can change while the dialog stays mounted; fall back during render
  // instead of syncing state from an effect.
  const selectedSourceId = sources.some((source) => source.id === sourceId)
    ? sourceId
    : (sources[0]?.id ?? "");

  const sourceItems = React.useMemo(
    () => sources.map((source) => ({ value: source.id, label: source.name })),
    [sources],
  );

  function resetResult() {
    setResult(null);
    setRequestError(null);
  }

  async function run() {
    const parsed = parseRehearsalPayload(payloadText);
    setPayloadInvalid(!parsed.ok);
    setRequestError(null);

    if (!parsed.ok || !selectedSourceId) {
      return;
    }

    setRunning(true);

    try {
      setResult(await onRehearse({ sourceId: selectedSourceId, payload: parsed.value }));
    } catch (error) {
      setResult(null);
      setRequestError(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!running) {
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
            disabled={disabled || sources.length === 0}
            title={t("sources.rehearsal.openTitle")}
            className="w-fit"
          />
        }
      >
        <RiPlayLine data-icon="inline-start" aria-hidden />
        {t("sources.rehearsal.open")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader className="pr-8">
          <DialogTitle>{t("sources.rehearsal.title")}</DialogTitle>
          <DialogDescription>{t("sources.rehearsal.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <label className="text-muted-foreground text-xs" htmlFor="source-rehearsal-source">
              {t("sources.rehearsal.sourceLabel")}
            </label>
            <Select
              id="source-rehearsal-source"
              items={sourceItems}
              value={selectedSourceId}
              disabled={running}
              onValueChange={(value) => {
                setSourceId(String(value));
                resetResult();
              }}
            >
              <SelectTrigger size="sm" className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {sourceItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs" htmlFor="source-rehearsal-payload">
              {t("sources.rehearsal.payloadLabel")}
            </label>
            <Textarea
              id="source-rehearsal-payload"
              rows={8}
              spellCheck={false}
              className={cn("font-mono text-xs", payloadInvalid && "border-destructive")}
              aria-invalid={payloadInvalid}
              placeholder={t("sources.rehearsal.payloadPlaceholder")}
              value={payloadText}
              disabled={running}
              onChange={(event) => {
                setPayloadText(event.target.value);
                setPayloadInvalid(false);
                resetResult();
              }}
            />
            {payloadInvalid ? (
              <p className="text-destructive text-xs">{t("sources.rehearsal.payloadInvalid")}</p>
            ) : null}
          </div>

          {requestError ? (
            <Alert variant="destructive">
              <AlertTitle>{t("sources.rehearsal.requestFailed")}</AlertTitle>
              <AlertDescription className="break-words">{requestError}</AlertDescription>
            </Alert>
          ) : null}

          {result ? <SourceRehearsalResultView result={result} /> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={running} onClick={() => setOpen(false)}>
            {t("common.actions.cancel")}
          </Button>
          <Button type="button" disabled={running || !selectedSourceId} onClick={() => void run()}>
            {running ? t("sources.rehearsal.running") : t("sources.rehearsal.run")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
