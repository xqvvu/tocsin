// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { ImportConfigurationResult } from "@tocsin/core";

import { useSettingsWorkspace } from "#/features/configuration/ui/use-settings-workspace";

const testState = vi.hoisted(() => ({
  exportConfigurationJson: vi.fn<(input: { includeSecrets: false }) => Promise<{ json: string }>>(),
  exportConfigurationToml: vi.fn<(input: { includeSecrets: false }) => Promise<{ toml: string }>>(),
  importConfigurationJson: vi.fn<(input: { json: string }) => Promise<ImportConfigurationResult>>(),
  importConfigurationToml: vi.fn<(input: { toml: string }) => Promise<ImportConfigurationResult>>(),
  invalidateConfiguration: vi.fn<() => Promise<void>>(),
  updateAppSettings: vi.fn<(input: { rawPayloadRetentionDays: number }) => Promise<unknown>>(),
  downloadTextFile: vi.fn<(input: { filename: string; text: string; type: string }) => void>(),
  readTextFile: vi.fn<(file: File) => Promise<string>>(),
  toast: {
    error: vi.fn<(title: string, options?: { description?: string }) => void>(),
  },
}));

vi.mock("#/features/configuration/api/configuration.mutations", () => ({
  useConfigurationMutations: () => ({
    exportConfigurationJson: testState.exportConfigurationJson,
    exportConfigurationToml: testState.exportConfigurationToml,
    importConfigurationJson: testState.importConfigurationJson,
    importConfigurationToml: testState.importConfigurationToml,
    invalidateConfiguration: testState.invalidateConfiguration,
    updateAppSettings: testState.updateAppSettings,
  }),
}));

vi.mock("#/i18n/use-i18n", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("#/lib/browser", () => ({
  downloadTextFile: testState.downloadTextFile,
  readTextFile: testState.readTextFile,
}));

vi.mock("sonner", () => ({
  toast: testState.toast,
}));

describe("settings workspace", () => {
  beforeEach(() => {
    testState.exportConfigurationJson.mockReset().mockResolvedValue({ json: "{}\n" });
    testState.exportConfigurationToml.mockReset().mockResolvedValue({ toml: "[settings]\n" });
    testState.importConfigurationJson.mockReset().mockResolvedValue({ generatedSourceTokens: [] });
    testState.importConfigurationToml.mockReset().mockResolvedValue({ generatedSourceTokens: [] });
    testState.invalidateConfiguration.mockReset().mockResolvedValue();
    testState.updateAppSettings.mockReset().mockResolvedValue(undefined);
    testState.downloadTextFile.mockReset();
    testState.readTextFile.mockReset();
    testState.toast.error.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("auto-loads each portable format once", async () => {
    const { result } = renderHook(() => useSettingsWorkspace());

    act(() => result.current.setActiveTab("toml"));

    await vi.waitFor(() => {
      expect(result.current.portable.toml.value).toBe("[settings]\n");
      expect(result.current.pending).toBe(false);
    });

    act(() => result.current.setActiveTab("ui"));
    act(() => result.current.setActiveTab("toml"));

    await act(async () => {
      await Promise.resolve();
    });

    expect(testState.exportConfigurationToml).toHaveBeenCalledTimes(1);

    act(() => result.current.setActiveTab("json"));

    await vi.waitFor(() => {
      expect(result.current.portable.json.value).toBe("{}\n");
    });

    expect(testState.exportConfigurationJson).toHaveBeenCalledTimes(1);
  });

  it("downloads a fresh snapshot for manual export", async () => {
    testState.exportConfigurationToml
      .mockResolvedValueOnce({ toml: "initial\n" })
      .mockResolvedValueOnce({ toml: "downloaded\n" });
    const { result } = renderHook(() => useSettingsWorkspace());

    act(() => result.current.setActiveTab("toml"));
    await vi.waitFor(() => expect(result.current.portable.toml.value).toBe("initial\n"));

    await act(async () => {
      await result.current.portable.toml.onExport();
    });

    expect(testState.downloadTextFile).toHaveBeenCalledWith({
      filename: "tocsin.toml",
      text: "downloaded\n",
      type: "application/toml;charset=utf-8",
    });
    expect(testState.invalidateConfiguration).toHaveBeenCalledTimes(1);
    expect(result.current.portable.toml.value).toBe("downloaded\n");
  });

  it("invalidates and reloads the active draft after import", async () => {
    const importNotice: ImportConfigurationResult = {
      generatedSourceTokens: [
        {
          sourceId: "source-1",
          sourceName: "Grafana",
          token: "generated-token",
        },
      ],
    };
    testState.exportConfigurationJson
      .mockResolvedValueOnce({ json: '{"state":"before"}\n' })
      .mockResolvedValueOnce({ json: '{"state":"after"}\n' });
    testState.importConfigurationJson.mockResolvedValueOnce(importNotice);
    const { result } = renderHook(() => useSettingsWorkspace());

    act(() => result.current.setActiveTab("json"));
    await vi.waitFor(() => expect(result.current.portable.json.value).toBe('{"state":"before"}\n'));

    await act(async () => {
      await result.current.portable.json.onImport('{"state":"draft"}');
    });

    await vi.waitFor(() => {
      expect(result.current.portable.json.value).toBe('{"state":"after"}\n');
      expect(result.current.importNotice).toEqual(importNotice);
    });

    expect(testState.importConfigurationJson).toHaveBeenCalledWith({
      json: '{"state":"draft"}',
    });
    expect(testState.invalidateConfiguration).toHaveBeenCalledTimes(1);
    expect(testState.exportConfigurationJson).toHaveBeenCalledTimes(2);
  });

  it("reports a failed auto-load without retrying on tab revisit", async () => {
    testState.exportConfigurationToml.mockRejectedValueOnce(new Error("export failed"));
    const { result } = renderHook(() => useSettingsWorkspace());

    act(() => result.current.setActiveTab("toml"));

    await vi.waitFor(() => {
      expect(testState.toast.error).toHaveBeenCalledWith("configuration.settings.operationFailed", {
        description: "export failed",
      });
      expect(result.current.pending).toBe(false);
    });

    act(() => result.current.setActiveTab("ui"));
    act(() => result.current.setActiveTab("toml"));
    await act(async () => {
      await Promise.resolve();
    });

    expect(testState.exportConfigurationToml).toHaveBeenCalledTimes(1);
  });

  it("reloads the active draft after manual refresh", async () => {
    testState.exportConfigurationToml
      .mockResolvedValueOnce({ toml: "before refresh\n" })
      .mockResolvedValueOnce({ toml: "after refresh\n" });
    const { result } = renderHook(() => useSettingsWorkspace());

    act(() => result.current.setActiveTab("toml"));
    await vi.waitFor(() => expect(result.current.portable.toml.value).toBe("before refresh\n"));

    await act(async () => {
      await result.current.refresh();
    });

    await vi.waitFor(() => {
      expect(result.current.portable.toml.value).toBe("after refresh\n");
    });

    expect(testState.invalidateConfiguration).toHaveBeenCalledTimes(1);
    expect(testState.exportConfigurationToml).toHaveBeenCalledTimes(2);
  });

  it("loads a picked file into the draft without importing it", async () => {
    testState.readTextFile.mockResolvedValue('[settings]\ntime_zone = "Asia/Shanghai"\n');
    const { result } = renderHook(() => useSettingsWorkspace());

    act(() => result.current.portable.toml.onLoadFile(new File(["[settings]\n"], "tocsin.toml")));

    await vi.waitFor(() => {
      expect(result.current.portable.toml.value).toBe('[settings]\ntime_zone = "Asia/Shanghai"\n');
    });

    expect(testState.readTextFile).toHaveBeenCalledTimes(1);
    expect(testState.importConfigurationToml).not.toHaveBeenCalled();
    expect(result.current.importNotice).toBeNull();
  });

  it("rejects oversized config files before reading them", async () => {
    const { result } = renderHook(() => useSettingsWorkspace());
    const oversized = new File(["x"], "huge.toml");

    Object.defineProperty(oversized, "size", { value: 1024 * 1024 + 1 });

    act(() => result.current.portable.toml.onLoadFile(oversized));

    await vi.waitFor(() => {
      expect(testState.toast.error).toHaveBeenCalledWith(
        "configuration.portableConfig.fileTooLarge",
      );
    });

    expect(testState.readTextFile).not.toHaveBeenCalled();
    expect(result.current.portable.toml.value).toBe("");
  });

  it("rejects an empty picked file without replacing the draft", async () => {
    testState.readTextFile.mockResolvedValue("  \n");
    const { result } = renderHook(() => useSettingsWorkspace());

    act(() => result.current.portable.toml.onChange("[settings]\nexisting = true\n"));
    act(() => result.current.portable.toml.onLoadFile(new File(["  \n"], "empty.toml")));

    await vi.waitFor(() => {
      expect(testState.toast.error).toHaveBeenCalledWith("configuration.portableConfig.fileEmpty");
    });

    expect(result.current.portable.toml.value).toBe("[settings]\nexisting = true\n");
  });
});
