// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { ActiveSessionSummary } from "@tocsin/api";

import { SettingsSecurityPanel } from "#/features/configuration/ui/settings-security-panel";
import { AppIntlProvider } from "#/i18n/provider";

const CURRENT_SESSION: ActiveSessionSummary = {
  id: "session-current",
  createdAt: "2026-10-26T01:00:00.000Z",
  updatedAt: "2026-10-27T02:00:00.000Z",
  expiresAt: "2026-11-02T01:00:00.000Z",
  ipAddress: "203.0.113.9",
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  current: true,
};

const OTHER_SESSION: ActiveSessionSummary = {
  ...CURRENT_SESSION,
  id: "session-other",
  ipAddress: null,
  userAgent: null,
  current: false,
};

const testState = vi.hoisted(() => ({
  sessions: [] as ActiveSessionSummary[],
  revokeOtherSessions: vi.fn<() => Promise<{ status: boolean }>>(),
  toast: {
    success: vi.fn<(title: string) => void>(),
    error: vi.fn<(title: string, options?: { description?: string }) => void>(),
  },
}));

vi.mock("#/features/configuration/api/configuration.queries", () => ({
  activeSessionsQueryOptions: () => ({
    queryKey: ["test", "active-sessions"],
    queryFn: async () => ({ sessions: testState.sessions }),
    staleTime: Infinity,
  }),
}));

vi.mock("#/features/configuration/api/use-session-mutations", () => ({
  useSessionMutations: () => ({
    revoking: false,
    revokeOtherSessions: testState.revokeOtherSessions,
  }),
}));

vi.mock("sonner", () => ({ toast: testState.toast }));

describe("settings security panel", () => {
  afterEach(() => {
    cleanup();
    testState.sessions = [];
    testState.revokeOtherSessions.mockReset();
    testState.toast.success.mockClear();
    testState.toast.error.mockClear();
  });

  it("labels the current session and renders unknown client and address", async () => {
    testState.sessions = [CURRENT_SESSION, OTHER_SESSION];

    renderPanel();

    expect(await screen.findByText("Current session")).toBeTruthy();
    expect(screen.getByText("Other session")).toBeTruthy();
    expect(screen.getByText("203.0.113.9")).toBeTruthy();
    expect(screen.getByText("Unknown")).toBeTruthy();
    expect(screen.getByText("Unknown client")).toBeTruthy();
    expect(screen.getByText("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBeTruthy();
  });

  it("disables signing out other devices when none exist", async () => {
    testState.sessions = [CURRENT_SESSION];

    renderPanel();

    const button = await screen.findByRole("button", { name: "Sign out other devices" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("asks for confirmation and reports a successful revocation", async () => {
    testState.sessions = [CURRENT_SESSION, OTHER_SESSION];
    testState.revokeOtherSessions.mockResolvedValue({ status: true });

    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Sign out other devices" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/need to sign in again/)).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Sign out other devices" }));

    await waitFor(() => {
      expect(testState.revokeOtherSessions).toHaveBeenCalledTimes(1);
      expect(testState.toast.success).toHaveBeenCalledWith("Other devices signed out");
    });
  });

  it("surfaces a failed revocation instead of claiming success", async () => {
    testState.sessions = [CURRENT_SESSION, OTHER_SESSION];
    testState.revokeOtherSessions.mockResolvedValue({ status: false });

    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Sign out other devices" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Sign out other devices" }));

    await waitFor(() => {
      expect(testState.toast.error).toHaveBeenCalledWith("Signing out other devices failed");
    });
    expect(testState.toast.success).not.toHaveBeenCalled();
  });
});

function renderPanel(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <AppIntlProvider locale="en-US">
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={null}>
          <SettingsSecurityPanel />
        </Suspense>
      </QueryClientProvider>
    </AppIntlProvider>,
  );
}
