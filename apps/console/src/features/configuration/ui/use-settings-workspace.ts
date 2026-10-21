import * as React from "react";
import { toast } from "sonner";

import type { ImportConfigurationResult } from "@tocsin/core";

import { useConfigurationMutations } from "#/features/configuration/api/configuration.mutations";
import { useTranslations } from "#/i18n/use-i18n";
import { downloadTextFile, readTextFile } from "#/lib/browser";

type SettingsTab = "ui" | PortableConfigFormat;
type PortableConfigFormat = "toml" | "json";
type DraftStatus = "idle" | "loading" | "loaded" | "failed";

const maxConfigFileBytes = 1024 * 1024;

interface PortableConfigDraft {
  value: string;
  status: DraftStatus;
}

type PortableConfigDrafts = Record<PortableConfigFormat, PortableConfigDraft>;

const initialDrafts: PortableConfigDrafts = {
  toml: { value: "", status: "idle" },
  json: { value: "", status: "idle" },
};

export function useSettingsWorkspace() {
  const t = useTranslations();
  const {
    exportConfigurationJson,
    exportConfigurationToml,
    importConfigurationJson,
    importConfigurationToml,
    invalidateConfiguration,
  } = useConfigurationMutations();
  const [activeTab, setActiveTabState] = React.useState<SettingsTab>("ui");
  const [drafts, setDrafts] = React.useState<PortableConfigDrafts>(initialDrafts);
  const [importNotice, setImportNotice] = React.useState<ImportConfigurationResult | null>(null);
  const [pendingAction, setPendingAction] = React.useState<string | null>(null);
  const pending = pendingAction !== null;

  const showOperationError = React.useCallback(
    (error: unknown) => {
      toast.error(t("configuration.settings.operationFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
    },
    [t],
  );

  const setDraft = React.useCallback((format: PortableConfigFormat, value: string) => {
    setDrafts((current) => ({
      ...current,
      [format]: {
        ...current[format],
        value,
      },
    }));
  }, []);

  const setDraftStatus = React.useCallback((format: PortableConfigFormat, status: DraftStatus) => {
    setDrafts((current) => ({
      ...current,
      [format]: {
        ...current[format],
        status,
      },
    }));
  }, []);

  const loadCurrentConfig = React.useCallback(
    async (format: PortableConfigFormat): Promise<string> => {
      const value =
        format === "toml"
          ? (
              await exportConfigurationToml({
                includeSecrets: false,
              })
            ).toml
          : (
              await exportConfigurationJson({
                includeSecrets: false,
              })
            ).json;

      setDrafts((current) => ({
        ...current,
        [format]: {
          value,
          status: "loaded",
        },
      }));
      return value;
    },
    [exportConfigurationJson, exportConfigurationToml],
  );

  React.useEffect(() => {
    if (activeTab === "ui" || pending || drafts[activeTab].status !== "idle") {
      return;
    }

    const format = activeTab;
    setDraftStatus(format, "loading");
    setPendingAction(`load-config-${format}`);

    void loadCurrentConfig(format)
      .catch((error: unknown) => {
        setDraftStatus(format, "failed");
        showOperationError(error);
      })
      .finally(() => {
        setPendingAction(null);
      });
  }, [activeTab, drafts, loadCurrentConfig, pending, setDraftStatus, showOperationError]);

  const invalidatePortableConfigDrafts = React.useCallback(() => {
    setDrafts((current) => ({
      toml: {
        value: activeTab === "toml" ? current.toml.value : "",
        status: "idle",
      },
      json: {
        value: activeTab === "json" ? current.json.value : "",
        status: "idle",
      },
    }));
  }, [activeTab]);

  const refreshConfiguration = React.useCallback(
    async (options: { invalidatePortableConfig?: boolean } = {}): Promise<boolean> => {
      try {
        await invalidateConfiguration();

        if (options.invalidatePortableConfig) {
          invalidatePortableConfigDrafts();
        }

        return true;
      } catch (error) {
        showOperationError(error);
        return false;
      }
    },
    [invalidateConfiguration, invalidatePortableConfigDrafts, showOperationError],
  );

  const submitAction = React.useCallback(
    async <T>(action: string, fn: () => Promise<T>): Promise<T | null> => {
      setPendingAction(action);

      try {
        const result = await fn();
        await refreshConfiguration();
        return result;
      } catch (error) {
        showOperationError(error);
        return null;
      } finally {
        setPendingAction(null);
      }
    },
    [refreshConfiguration, showOperationError],
  );

  const submitConfigurationChange = React.useCallback(
    async <T>(action: string, fn: () => Promise<T>): Promise<T | null> => {
      const result = await submitAction(action, fn);

      if (result) {
        invalidatePortableConfigDrafts();
      }

      return result;
    },
    [invalidatePortableConfigDrafts, submitAction],
  );

  const loadConfigFile = React.useCallback(
    async (format: PortableConfigFormat, file: File) => {
      if (file.size > maxConfigFileBytes) {
        toast.error(t("configuration.portableConfig.fileTooLarge"));
        return;
      }

      try {
        const value = await readTextFile(file);

        if (value.trim().length === 0) {
          toast.error(t("configuration.portableConfig.fileEmpty"));
          return;
        }

        setDraft(format, value);
      } catch (error) {
        showOperationError(error);
      }
    },
    [setDraft, showOperationError, t],
  );

  const exportConfig = React.useCallback(
    (format: PortableConfigFormat) =>
      submitAction(format === "toml" ? "export-config" : "export-config-json", async () => {
        const value = await loadCurrentConfig(format);

        downloadTextFile({
          filename: `tocsin.${format}`,
          text: value,
          type:
            format === "toml" ? "application/toml;charset=utf-8" : "application/json;charset=utf-8",
        });

        return { value };
      }),
    [loadCurrentConfig, submitAction],
  );

  const importConfig = React.useCallback(
    (format: PortableConfigFormat, value: string) =>
      submitConfigurationChange(
        format === "toml" ? "import-config" : "import-config-json",
        async () => {
          const result =
            format === "toml"
              ? await importConfigurationToml({ toml: value })
              : await importConfigurationJson({ json: value });

          setImportNotice(result);
          return result;
        },
      ),
    [importConfigurationJson, importConfigurationToml, submitConfigurationChange],
  );

  return {
    activeTab,
    setActiveTab: (value: string) => {
      setActiveTabState(value === "toml" || value === "json" ? value : "ui");
    },
    pending,
    importNotice,
    refresh: () => refreshConfiguration({ invalidatePortableConfig: true }),
    portable: {
      toml: {
        value: drafts.toml.value,
        onChange: (value: string) => setDraft("toml", value),
        onLoadFile: (file: File) => void loadConfigFile("toml", file),
        onExport: () => exportConfig("toml"),
        onImport: (value: string) => importConfig("toml", value),
      },
      json: {
        value: drafts.json.value,
        onChange: (value: string) => setDraft("json", value),
        onLoadFile: (file: File) => void loadConfigFile("json", file),
        onExport: () => exportConfig("json"),
        onImport: (value: string) => importConfig("json", value),
      },
    },
  };
}
