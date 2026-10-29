// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { AppIntlProvider } from "#/i18n/provider";

import { SourceForm } from "./source-form";
import type { SourceFormSubmitInput } from "./source-ui-types";

const storedValues = { name: "Grafana production", provider: "grafana" as const };

function renderForm(options: { edit?: boolean } = {}) {
  const onSubmit = vi.fn<(input: SourceFormSubmitInput) => void>();

  render(
    <AppIntlProvider locale="en-US">
      <SourceForm
        defaultValues={storedValues}
        pending={false}
        submitLabel="Save source"
        submitIcon={null}
        onSubmit={onSubmit}
        onCancel={options.edit ? () => {} : undefined}
      />
    </AppIntlProvider>,
  );

  return { onSubmit };
}

/** Drives the provider select the way an operator picks a different parser. */
async function chooseProvider(label: string): Promise<void> {
  fireEvent.click(screen.getByRole("combobox", { name: "Provider" }));
  const option = await screen.findByRole("option", { name: label });
  fireEvent.pointerDown(option);
  fireEvent.click(option);
}

function clickSave(): void {
  fireEvent.click(screen.getByRole("button", { name: "Save source" }));
}

describe("source form provider switch", () => {
  afterEach(() => {
    cleanup();
  });

  it("saves an edited source directly when the parser is unchanged", async () => {
    const { onSubmit } = renderForm({ edit: true });

    clickSave();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ provider: "grafana" });
    expect(screen.queryByText("Change the provider parser?")).toBeNull();
  });

  it("asks before switching the parser of an existing source", async () => {
    const { onSubmit } = renderForm({ edit: true });

    await chooseProvider("SigNoz");
    clickSave();

    expect(await screen.findByText("Change the provider parser?")).toBeTruthy();
    // The description names both sides of the switch, so the operator can tell
    // a mis-click from an intended migration.
    const description = screen.getByText(/The parser will switch from/).textContent ?? "";
    expect(description).toContain("Grafana");
    expect(description).toContain("SigNoz");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the new parser after the switch is confirmed", async () => {
    const { onSubmit } = renderForm({ edit: true });

    await chooseProvider("SigNoz");
    clickSave();
    fireEvent.click(await screen.findByRole("button", { name: "Switch parser" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      name: "Grafana production",
      provider: "signoz",
    });
  });

  it("writes nothing when the switch is cancelled", async () => {
    const { onSubmit } = renderForm({ edit: true });

    await chooseProvider("SigNoz");
    clickSave();
    fireEvent.click(await screen.findByRole("button", { name: "Keep current parser" }));

    await waitFor(() => expect(screen.queryByText("Change the provider parser?")).toBeNull());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not ask when a new source picks its first parser", async () => {
    const { onSubmit } = renderForm();

    await chooseProvider("SigNoz");
    clickSave();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ provider: "signoz" });
    expect(screen.queryByText("Change the provider parser?")).toBeNull();
  });
});
