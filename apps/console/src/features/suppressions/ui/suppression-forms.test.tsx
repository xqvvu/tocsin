// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { DestinationListItem, SourceSummary } from "@tocsin/core";

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
      matcher: {
        sourceIds: ["source-grafana"],
        fingerprints: ["disk:full"],
      },
    });
    expect(screen.queryByText("This silences everything")).toBeNull();
  });

  it("warns how many automatically paging destinations the rule would mute", () => {
    renderCreateForm();

    expect(
      screen.getByText("1 destinations with automatic paging fall inside this rule"),
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
