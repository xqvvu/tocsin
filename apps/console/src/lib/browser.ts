import { createClientOnlyFn, createIsomorphicFn } from "@tanstack/react-start";

export const urlFromCurrentOrigin = createIsomorphicFn()
  .server((path: string) => path)
  .client((path: string) => new URL(path, window.location.origin).toString());

export const copyText = createClientOnlyFn(async (value: string): Promise<void> => {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Some browsers expose the Clipboard API but reject the write outside a
      // secure context or user gesture; fall through to the legacy path.
    }
  }

  if (!copyWithTextarea(value)) {
    throw new Error("Clipboard copy is unavailable");
  }
});

function copyWithTextarea(value: string): boolean {
  const activeElement = document.activeElement;
  const textarea = document.createElement("textarea");

  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.opacity = "0";
  document.body.append(textarea);

  try {
    textarea.select();
    textarea.setSelectionRange(0, value.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();

    if (activeElement instanceof HTMLElement) {
      activeElement.focus();
    }
  }
}

export const hardReloadPage = createClientOnlyFn(() => {
  window.location.reload();
});

export const readTextFile = createClientOnlyFn((file: File) => file.text());

export const downloadTextFile = createClientOnlyFn(
  ({ filename, text, type }: { filename: string; text: string; type: string }) => {
    const blob = new Blob([text], { type });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = href;
    link.download = filename;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  },
);
