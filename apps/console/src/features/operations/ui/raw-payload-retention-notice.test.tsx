// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { RawPayloadRetentionNotice } from "#/features/operations/ui/raw-payload-retention-notice";
import { AppIntlProvider } from "#/i18n/provider";

const testState = vi.hoisted(() => ({
  retentionDays: 30 as number | undefined,
}));

vi.mock("#/features/configuration/api/configuration.queries", () => ({
  appSettingsQueryOptions: () => ({
    queryKey: ["test", "app-settings"],
    queryFn: async () => ({ rawPayloadRetentionDays: testState.retentionDays }),
    staleTime: Infinity,
  }),
}));

// The real timestamp renders a client-only skeleton on the server and reads
// the configured time zone; the notice's job is deciding which sentence to
// show, so the timestamp is replaced by its ISO value.
vi.mock("#/features/operations/ui/operation-timestamp", () => ({
  OperationTimestamp: ({ value }: { value: string }) => <time dateTime={value}>{value}</time>,
}));

const NOW = new Date("2026-10-28T00:00:00.000Z");

describe("raw payload retention notice", () => {
  beforeEach(() => {
    testState.retentionDays = 30;
  });

  afterEach(() => {
    cleanup();
  });

  it("says when the window closes while the payload is still retained", async () => {
    renderNotice("2026-10-27T00:00:00.000Z");

    const note = await screen.findByRole("note");

    expect(note.textContent).toContain("Raw payload retained until");
    expect(note.textContent).toContain("2026-11-26T00:00:00.000Z");
    expect(note.textContent).toContain("30-day policy, pruned lazily in the background");
  });

  it("distinguishes an expired window the lazy sweep has not cleared yet", async () => {
    renderNotice("2026-09-01T00:00:00.000Z");

    const note = await screen.findByRole("note");

    expect(note.textContent).toContain("Past the 30-day raw payload retention window");
    expect(screen.queryByText("Raw payload retained until")).toBeNull();
  });

  it("shows nothing until settings describe a window", async () => {
    testState.retentionDays = undefined;
    renderNotice("2026-10-27T00:00:00.000Z");

    await waitFor(() => {
      expect(screen.queryByRole("note")).toBeNull();
    });
  });

  it("shows nothing for an event without a usable received timestamp", async () => {
    renderNotice("not-a-date");

    await waitFor(() => {
      expect(screen.queryByRole("note")).toBeNull();
    });
  });
});

function renderNotice(receivedAt: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AppIntlProvider locale="en-US" now={NOW}>
        <RawPayloadRetentionNotice receivedAt={receivedAt} />
      </AppIntlProvider>
    </QueryClientProvider>,
  );
}
