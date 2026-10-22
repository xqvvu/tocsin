// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { SourceTokenNoticePanel } from "#/features/sources/ui/source-token-notice-panel";
import { AppIntlProvider } from "#/i18n/provider";

const mocks = vi.hoisted(() => ({
  copyText: vi.fn<() => Promise<void>>(),
  toastError: vi.fn<(message: string, options?: { description: string }) => void>(),
  toastSuccess: vi.fn<(message: string) => void>(),
}));

vi.mock("#/lib/browser", () => ({
  copyText: mocks.copyText,
  urlFromCurrentOrigin: (path: string) => `http://localhost${path}`,
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

const notice = {
  sourceName: "Grafana",
  webhookPath: "/api/sources/source-1/webhook",
  token: "tocsin_token_abc123",
};

describe("source token notice panel", () => {
  beforeEach(() => {
    mocks.copyText.mockReset();
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  function renderPanel(onDismiss = vi.fn<() => void>()) {
    render(
      <AppIntlProvider locale="en-US">
        <SourceTokenNoticePanel notice={notice} onDismiss={onDismiss} />
      </AppIntlProvider>,
    );

    return onDismiss;
  }

  it("renders the one-time token as selectable text", () => {
    renderPanel();

    expect(screen.getByText(notice.token)).toBeTruthy();
    expect(screen.getByText("Access token")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("shows a success toast after copying the token", async () => {
    mocks.copyText.mockResolvedValue(undefined);
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Copy Token" }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Copied"));
    expect(mocks.copyText).toHaveBeenCalledWith(notice.token);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("shows an actionable error toast when copying the token fails", async () => {
    mocks.copyText.mockRejectedValue(new Error("clipboard unavailable"));
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Copy Token" }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("Copy failed", {
        description: "Select the content and copy it manually",
      }),
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("shows an actionable error toast when copying the webhook URL fails", async () => {
    mocks.copyText.mockRejectedValue(new Error("clipboard unavailable"));
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Copy URL" }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("Copy failed", {
        description: "Select the content and copy it manually",
      }),
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("dismisses from the close control and the explicit saved control", () => {
    const onDismiss = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss notice" }));
    fireEvent.click(screen.getByRole("button", { name: "I saved it" }));

    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
});
