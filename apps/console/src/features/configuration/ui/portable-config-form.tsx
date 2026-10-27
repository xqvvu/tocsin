import { RiDownloadLine, RiFileCodeLine, RiFolderOpenLine, RiUploadLine } from "@remixicon/react";
import { ClientOnly } from "@tanstack/react-router";
import * as React from "react";

import { JsonEditor } from "#/components/codemirror/json-editor";
import { TomlEditor } from "#/components/codemirror/toml-editor";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "#/components/ui/popover";
import { Textarea } from "#/components/ui/textarea";
import { previewPortableConfigChange } from "#/features/configuration/model/portable-config-diff";
import { PortableConfigDiffSummary } from "#/features/configuration/ui/portable-config-diff-summary";
import { useTranslations } from "#/i18n/use-i18n";

interface PortableConfigFormProps {
  format: "toml" | "json";
  value: string;
  /** Last exported current configuration; used for the pre-import diff preview. */
  baseline: string;
  pending: boolean;
  onChange: (value: string) => void;
  onLoadFile: (file: File) => void;
  onExport: () => Promise<unknown>;
  onImport: (config: string) => Promise<unknown>;
}

export function PortableConfigForm(props: PortableConfigFormProps) {
  const { format, value, baseline, pending, onChange, onLoadFile, onExport, onImport } = props;
  const t = useTranslations();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [confirmImportOpen, setConfirmImportOpen] = React.useState(false);
  const canImport = !pending && value.trim().length > 0;
  const preview = React.useMemo(
    () =>
      confirmImportOpen && canImport ? previewPortableConfigChange(format, value, baseline) : null,
    [baseline, canImport, confirmImportOpen, format, value],
  );
  const previewError = preview?.status === "unparsable" ? preview.detail : null;
  const formatLabel =
    format === "toml"
      ? t("configuration.portableConfig.tomlLabel")
      : t("configuration.portableConfig.jsonLabel");
  const description =
    format === "toml"
      ? t("configuration.portableConfig.tomlDescription")
      : t("configuration.portableConfig.jsonDescription");
  // The JSON sample contains braces, which ICU reads as an argument and rejects
  // as malformed, so it is read raw: it is literal text, not a template.
  const placeholder =
    format === "toml"
      ? t("configuration.portableConfig.tomlPlaceholder")
      : (t.raw("configuration.portableConfig.jsonPlaceholder") as string);
  const confirmImportTitle =
    format === "toml"
      ? t("configuration.portableConfig.confirmImportTitle")
      : t("configuration.portableConfig.confirmJsonImportTitle");
  const confirmImportDescription =
    format === "toml"
      ? t("configuration.portableConfig.confirmImportDescription")
      : t("configuration.portableConfig.confirmJsonImportDescription");

  function confirmImport() {
    setConfirmImportOpen(false);

    void onImport(value);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];

    event.currentTarget.value = "";

    if (file) {
      onLoadFile(file);
    }
  }

  return (
    <section className="border-border bg-card flex h-full min-w-0 flex-col border">
      <div className="border-border flex flex-col gap-2 border-b px-3 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <RiFileCodeLine className="size-4" aria-hidden />
            {t("configuration.portableConfig.title")}
            <Badge variant="outline" className="font-mono text-[10px]">
              {formatLabel}
            </Badge>
          </h2>
          <p className="text-muted-foreground mt-1 text-xs leading-5">{description}</p>
        </div>
      </div>
      <div className="min-h-0 min-w-0 grow p-3">
        {format === "toml" ? (
          <ClientOnly
            fallback={
              <Textarea
                id="portable-config-toml"
                className="bg-background text-foreground min-h-112 resize-y font-mono text-xs leading-5"
                placeholder={placeholder}
                value={value}
                readOnly
              />
            }
          >
            <React.Suspense fallback={<TomlEditor.Skeleton />}>
              <TomlEditor
                id="portable-config-toml"
                value={value}
                placeholder={placeholder}
                onChange={onChange}
              />
            </React.Suspense>
          </ClientOnly>
        ) : (
          <ClientOnly
            fallback={
              <Textarea
                id="portable-config-json"
                aria-label={formatLabel}
                className="bg-background text-foreground min-h-112 resize-y font-mono text-xs leading-5"
                placeholder={placeholder}
                value={value}
                readOnly
                spellCheck={false}
              />
            }
          >
            <React.Suspense fallback={<JsonEditor.Skeleton />}>
              <JsonEditor
                id="portable-config-json"
                value={value}
                placeholder={placeholder}
                onChange={onChange}
              />
            </React.Suspense>
          </ClientOnly>
        )}
      </div>
      <div className="border-border bg-muted/30 flex flex-col gap-2 border-t p-3">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={onExport}
            className="sm:w-fit"
          >
            <RiDownloadLine data-icon="inline-start" aria-hidden />
            {t("configuration.portableConfig.exportCurrent")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => fileInputRef.current?.click()}
            className="sm:w-fit"
          >
            <RiFolderOpenLine data-icon="inline-start" aria-hidden />
            {t("configuration.portableConfig.loadFile")}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".toml,.json,application/json,application/toml,text/plain"
            aria-label={t("configuration.portableConfig.loadFile")}
            className="hidden"
            onChange={handleFileChange}
          />
          <Popover
            open={confirmImportOpen}
            onOpenChange={(open) => {
              if (!pending) {
                setConfirmImportOpen(open);
              }
            }}
          >
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  disabled={!canImport}
                  className="sm:w-fit"
                  aria-label={t("configuration.portableConfig.applyImport")}
                />
              }
            >
              <RiUploadLine data-icon="inline-start" aria-hidden />
              {t("configuration.portableConfig.applyImport")}
            </PopoverTrigger>
            <PopoverContent
              align="end"
              side="top"
              sideOffset={6}
              className="w-96 max-w-[calc(100vw-2rem)]"
            >
              <PopoverHeader>
                <PopoverTitle>{confirmImportTitle}</PopoverTitle>
                <PopoverDescription>{confirmImportDescription}</PopoverDescription>
              </PopoverHeader>
              {preview?.status === "ok" ? <PortableConfigDiffSummary diff={preview.diff} /> : null}
              {previewError ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    {t("configuration.portableConfig.previewParseFailed", { detail: previewError })}
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className="flex justify-end gap-2">
                <PopoverClose render={<Button type="button" variant="outline" size="sm" />}>
                  {t("configuration.portableConfig.cancelImport")}
                </PopoverClose>
                <Button
                  type="button"
                  size="sm"
                  disabled={!canImport || previewError !== null}
                  onClick={confirmImport}
                >
                  <RiUploadLine data-icon="inline-start" aria-hidden />
                  {t("configuration.portableConfig.confirmImport")}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <p className="text-muted-foreground text-xs">
          {t("configuration.portableConfig.loadFileHint")}
        </p>
      </div>
    </section>
  );
}
