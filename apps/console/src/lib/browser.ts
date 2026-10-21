import { createClientOnlyFn, createIsomorphicFn } from "@tanstack/react-start";

export const urlFromCurrentOrigin = createIsomorphicFn()
  .server((path: string) => path)
  .client((path: string) => new URL(path, window.location.origin).toString());

export const copyText = createClientOnlyFn(async (value: string) => {
  if (!navigator.clipboard) {
    return false;
  }

  await navigator.clipboard.writeText(value);
  return true;
});

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
