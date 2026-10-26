// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { DestinationListItem, SourceSummary } from "@tocsin/core";

import { emptySuppressionMatcher } from "#/features/suppressions/model/suppression-form";
import {
  CreateSuppressionForm,
  type SuppressionFormSubmission,
} from "#/features/suppressions/ui/suppression-forms";
import { AppIntlProvider } from "#/i18n/provider";

const sources: SourceSummary[] = [
  { id: "source-grafana", name: "Grafana", provider: "grafana", enabled: true },
];

const destinations: DestinationListItem[] = [
  destinationFixture({ id: "destination-ops", name: "Ops group", urgentAutoEnabled: true }),
  destinationFixture({
    id: "destination-audit",
    name: "Audit channel",
    urgentAutoEnabled: false,
  }),
];

function renderCreateForm(): { onSubmit: ReturnType<typeof vi.fn> } {
  const onSubmit = vi.fn<(input: SuppressionFormSubmission) => void>();

  render(
    <AppIntlProvider locale="en-US">
      <CreateSuppressionForm
        sources={sources}
        destinations={destinations}
        pending={false}
        onSubmit={onSubmit}
      />
    </AppIntlProvider>,
  );

  return { onSubmit };
}

describe("suppression create form", () => {
  afterEach(() => {
    cleanup();
  });

  it("requires an explicit confirmation before saving a completely empty matcher", async () => {
    const { onSubmit } = renderCreateForm();

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "October database migration" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create suppression" }));

    // The matcher is empty: the save is intercepted by the confirmation.
    expect(await screen.findByText("This silences everything")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Silence everything" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      name: "October database migration",
      kind: "silence",
      enabled: true,
      matcher: {
        sourceIds: [],
        destinationIds: [],
        severities: [],
        statuses: [],
        fingerprints: [],
        labels: [],
        titleContains: [],
        messageContains: [],
      },
    });
  });

  it("saves without a confirmation once any condition is set", async () => {
    const { onSubmit } = renderCreateForm();

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Disk noise" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add: Fingerprints" }));
    fireEvent.change(screen.getByLabelText("Fingerprints 1"), {
      target: { value: "disk:full" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add: Fingerprints" }));
    fireEvent.change(screen.getByLabelText("Fingerprints 2"), {
      target: { value: "disk:inode" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create suppression" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    expect(onSubmit.mock.calls[0]![0]!.matcher.fingerprints).toEqual(["disk:full", "disk:inode"]);
    expect(screen.queryByText("This silences everything")).toBeNull();
  });

  it("keeps every add-condition button at its own size inside the field", () => {
    renderCreateForm();

    const addButtons = screen.getAllByRole("button", { name: /^Add: / });

    expect(addButtons).toHaveLength(4);

    for (const button of addButtons) {
      // A vertical Field forces every direct child to full width, which used to
      // render this xs button as an empty-looking bar. The button must sit one
      // level deeper so a wrapper absorbs that width instead.
      expect(button.parentElement).not.toBe(button.closest('[data-slot="field"]'));
    }
  });

  it("submits the prefilled source and fingerprint without touching the form", async () => {
    const onSubmit = vi.fn<(input: SuppressionFormSubmission) => void>();

    render(
      <AppIntlProvider locale="en-US">
        <CreateSuppressionForm
          sources={sources}
          destinations={destinations}
          pending={false}
          defaultValues={{
            name: "Silence: Disk full",
            startsAt: "2026-10-18T09:00",
            endsAt: "2026-10-18T11:00",
            matcher: {
              sourceIds: ["source-grafana"],
              destinationIds: [],
              severities: [],
              statuses: [],
              fingerprints: ["disk:full"],
              labels: [],
              titleContains: [],
              messageContains: [],
            },
          }}
          onSubmit={onSubmit}
        />
      </AppIntlProvider>,
    );

    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Silence: Disk full");
    fireEvent.click(screen.getByRole("button", { name: "Create suppression" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      name: "Silence: Disk full",
      // The provider defaults to UTC, so 09:00 wall clock is 09:00Z.
      startsAt: "2026-10-18T09:00:00.000Z",
      endsAt: "2026-10-18T11:00:00.000Z",
      matcher: {
        sourceIds: ["source-grafana"],
        fingerprints: ["disk:full"],
      },
    });
    expect(screen.queryByText("This silences everything")).toBeNull();
  });

  it("interprets the window in the console time zone and names that zone", async () => {
    const onSubmit = vi.fn<(input: SuppressionFormSubmission) => void>();

    render(
      <AppIntlProvider locale="en-US" timeZone="Asia/Shanghai">
        <CreateSuppressionForm
          sources={sources}
          destinations={destinations}
          pending={false}
          defaultValues={{
            name: "Silence: Disk full",
            startsAt: "2026-10-18T09:00",
            endsAt: "2026-10-18T11:00",
            matcher: { ...emptySuppressionMatcher(), fingerprints: ["disk:full"] },
          }}
          onSubmit={onSubmit}
        />
      </AppIntlProvider>,
    );

    // 09:00 in Shanghai is 01:00Z; a browser-zone reading would store a
    // different instant and the list would show a shifted window.
    expect(screen.getByText("Times use the console time zone (Asia/Shanghai)")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Create suppression" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      startsAt: "2026-10-18T01:00:00.000Z",
      endsAt: "2026-10-18T03:00:00.000Z",
    });
  });

  it("reports a wall clock skipped by DST as an invalid date", async () => {
    const onSubmit = vi.fn<(input: SuppressionFormSubmission) => void>();

    render(
      <AppIntlProvider locale="en-US" timeZone="America/New_York">
        <CreateSuppressionForm
          sources={sources}
          destinations={destinations}
          pending={false}
          defaultValues={{
            name: "DST gap",
            startsAt: "2026-03-08T02:30",
            endsAt: "2026-03-08T03:30",
            matcher: { ...emptySuppressionMatcher(), fingerprints: ["dst:gap"] },
          }}
          onSubmit={onSubmit}
        />
      </AppIntlProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create suppression" }));

    expect(await screen.findByText("Choose a valid start and end time")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("warns how many automatically paging destinations the rule would mute", () => {
    renderCreateForm();

    expect(
      screen.getByText("1 destination with automatic paging falls inside this rule"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "While this rule applies, matching alerts for these destinations cannot be woken by any Tocsin means — not automatically and not by a manual buzz",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Affected destinations: Ops group")).toBeTruthy();
  });
});

function destinationFixture(overrides: {
  id: string;
  name: string;
  urgentAutoEnabled: boolean;
}): DestinationListItem {
  return {
    id: overrides.id,
    name: overrides.name,
    kind: "feishu",
    enabled: true,
    operationalConfig: {
      endpoint: null,
      host: null,
      method: null,
      to: null,
      from: null,
      replyTo: null,
      subjectPrefix: null,
      headerNames: null,
      templateConfigured: false,
      templateMode: null,
      templateSource: null,
      signingConfigured: false,
      secretFieldPaths: [],
      sendMode: "app",
      appRef: null,
      chatId: null,
      urgentAutoEnabled: overrides.urgentAutoEnabled,
      urgentReceivers: ["ou_1"],
    },
  };
}
