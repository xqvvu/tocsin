// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { copyText } from "#/lib/browser";

const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const execCommandDescriptor = Object.getOwnPropertyDescriptor(document, "execCommand");

function setClipboard(value: { writeText: (text: string) => Promise<void> } | undefined): void {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value,
  });
}

function setExecCommand(impl: (() => boolean) | undefined): () => boolean {
  const execCommand = vi.fn(impl);

  Object.defineProperty(document, "execCommand", {
    configurable: true,
    writable: true,
    value: execCommand,
  });

  return execCommand;
}

describe("copyText", () => {
  afterEach(() => {
    vi.restoreAllMocks();

    if (clipboardDescriptor) {
      Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }

    if (execCommandDescriptor) {
      Object.defineProperty(document, "execCommand", execCommandDescriptor);
    } else {
      Reflect.deleteProperty(document, "execCommand");
    }
  });

  it("uses the Clipboard API when it is available", async () => {
    const writeText = vi.fn(async () => {});
    setClipboard({ writeText });
    const execCommand = setExecCommand(() => true);

    await expect(copyText("token")).resolves.toBeUndefined();

    expect(writeText).toHaveBeenCalledWith("token");
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("falls back to execCommand when the Clipboard API is unavailable", async () => {
    setClipboard(undefined);
    const execCommand = setExecCommand(() => true);

    await expect(copyText("token")).resolves.toBeUndefined();

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back to execCommand when the Clipboard API rejects", async () => {
    const writeText = vi.fn(async () => Promise.reject(new Error("blocked")));
    setClipboard({ writeText });
    const execCommand = setExecCommand(() => true);

    await expect(copyText("token")).resolves.toBeUndefined();

    expect(writeText).toHaveBeenCalledWith("token");
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("throws when both clipboard paths fail", async () => {
    setClipboard(undefined);
    setExecCommand(() => false);

    await expect(copyText("token")).rejects.toThrow("Clipboard copy is unavailable");
  });

  it("removes the fallback textarea when execCommand throws", async () => {
    setClipboard(undefined);
    setExecCommand(() => {
      throw new Error("not implemented");
    });

    await expect(copyText("token")).rejects.toThrow("Clipboard copy is unavailable");

    expect(document.querySelector("textarea")).toBeNull();
  });
});
