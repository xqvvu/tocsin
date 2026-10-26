// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { DestinationSummary, RouteDefinition, SourceSummary } from "@tocsin/core";

import { EditRouteForm } from "#/features/routes/ui/route-forms";
import { AppIntlProvider } from "#/i18n/provider";

const testState = vi.hoisted(() => ({
  queued: 2,
}));

vi.mock("#/features/operations/api/operations.queries", () => ({
  pendingDeliveriesQueryOptions: (scope: unknown) => ({
    queryKey: ["test", "pending-deliveries", scope],
    queryFn: async () => ({ deliveries: { total: testState.queued } }),
    staleTime: Infinity,
  }),
}));

interface EditRouteInput {
  id: string;
  name: string;
  rule: RouteDefinition["rule"];
  destinationIds: string[];
}

const sources: SourceSummary[] = [
  { id: "source-grafana", name: "Grafana", provider: "grafana", enabled: true },
  { id: "source-alertmanager", name: "Alertmanager", provider: "alertmanager", enabled: true },
];

const destinations: DestinationSummary[] = [
  { id: "destination-ops", name: "Ops Webhook", kind: "generic_webhook", enabled: true },
];

/** Two entries in every condition class: the shape only import/TOML/API can produce. */
function multiConditionRoute(): RouteDefinition {
  return {
    id: "route-critical",
    name: "Critical to ops",
    enabled: true,
    rule: {
      sourceIds: ["source-grafana", "source-alertmanager"],
      severities: ["critical", "warning"],
      statuses: ["firing", "unknown"],
      labels: [
        { key: "team", operator: "equals", value: "sre" },
        { key: "cluster", operator: "contains", value: "prod" },
      ],
      titleContains: ["DiskFull", "VolumeFull"],
      messageContains: ["volume", "filesystem"],
    },
    destinationIds: ["destination-ops"],
  };
}

function emptyRuleRoute(): RouteDefinition {
  return {
    id: "route-catch-all",
    name: "Everything to ops",
    enabled: true,
    rule: {
      sourceIds: [],
      severities: [],
      statuses: [],
      labels: [],
      titleContains: [],
      messageContains: [],
    },
    destinationIds: ["destination-ops"],
  };
}

function renderEditForm(route: RouteDefinition): {
  onSubmit: ReturnType<typeof vi.fn>;
  queryClient: QueryClient;
} {
  const onSubmit = vi.fn<(input: EditRouteInput) => void>();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <AppIntlProvider locale="en-US">
        <EditRouteForm
          route={route}
          sources={sources}
          destinations={destinations}
          pending={false}
          onCancel={vi.fn<() => void>()}
          onSubmit={onSubmit}
        />
      </AppIntlProvider>
    </QueryClientProvider>,
  );

  return { onSubmit, queryClient };
}

function saveRoute(): void {
  fireEvent.click(screen.getByRole("button", { name: "Save route" }));
}

describe("edit route form", () => {
  afterEach(() => {
    cleanup();
  });

  it("round-trips a multi-condition rule that the operator did not change", async () => {
    const route = multiConditionRoute();

    const { onSubmit } = renderEditForm(route);
    saveRoute();

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      id: route.id,
      name: route.name,
      rule: route.rule,
      destinationIds: route.destinationIds,
    });
  });

  it("shows the localized name error instead of the browser's native validation", async () => {
    const { onSubmit } = renderEditForm(multiConditionRoute());

    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    // The native constraint would preempt the submit event and show a bubble in
    // the browser's language; the ARIA flag keeps the field announced as required.
    expect(nameInput.hasAttribute("required")).toBe(false);
    expect(nameInput.getAttribute("aria-required")).toBe("true");
    // The form itself opts out of native constraint validation too, so a future
    // `required` field cannot silently reintroduce the browser bubble.
    expect((nameInput.closest("form") as HTMLFormElement | null)?.noValidate).toBe(true);

    fireEvent.change(nameInput, { target: { value: "" } });
    saveRoute();

    await waitFor(() => {
      expect(screen.getByText("Route name is required")).toBeTruthy();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("asks for confirmation before saving a route with no conditions", async () => {
    const route = emptyRuleRoute();

    const { onSubmit } = renderEditForm(route);
    saveRoute();

    await waitFor(() => {
      expect(screen.getByText("This route matches everything")).toBeTruthy();
    });
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Match every alert" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      id: route.id,
      name: route.name,
      rule: route.rule,
      destinationIds: route.destinationIds,
    });
  });

  it("does not save an empty-rule route when the confirmation is cancelled", async () => {
    const route = emptyRuleRoute();

    const { onSubmit } = renderEditForm(route);
    saveRoute();

    await waitFor(() => {
      expect(screen.getByText("This route matches everything")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Back to conditions" }));

    await waitFor(() => {
      expect(screen.queryByText("This route matches everything")).toBeNull();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows every stored condition entry instead of only the first of each class", () => {
    renderEditForm(multiConditionRoute());

    // Text conditions: both stored substrings have their own row.
    expect(screen.getByDisplayValue("DiskFull")).toBeTruthy();
    expect(screen.getByDisplayValue("VolumeFull")).toBeTruthy();
    expect(screen.getByDisplayValue("volume")).toBeTruthy();
    expect(screen.getByDisplayValue("filesystem")).toBeTruthy();
    expect(screen.getByDisplayValue("team")).toBeTruthy();
    expect(screen.getByDisplayValue("cluster")).toBeTruthy();
    expect(screen.getByDisplayValue("sre")).toBeTruthy();
    expect(screen.getByDisplayValue("prod")).toBeTruthy();

    // Choice conditions: both stored values are shown on their own control.
    expect(screen.getByRole("combobox", { name: "Source 1" }).textContent).toContain("Grafana");
    expect(screen.getByRole("combobox", { name: "Source 2" }).textContent).toContain(
      "Alertmanager",
    );
    expect(screen.getByRole("combobox", { name: "Severity 2" }).textContent).toContain("Warning");
    expect(screen.getByRole("combobox", { name: "Status 2" }).textContent).toContain("Unknown");
    expect(screen.getByRole("combobox", { name: "Operator 2" }).textContent).toContain("Contains");
  });

  it("keeps every add-condition button at its own size inside the field", () => {
    renderEditForm(emptyRuleRoute());

    const addButtons = screen.getAllByRole("button", { name: /^Add condition: / });

    expect(addButtons).toHaveLength(6);

    for (const button of addButtons) {
      // A vertical Field forces every direct child to full width, which used to
      // render this xs button as an empty-looking bar. The button must sit one
      // level deeper so a wrapper absorbs that width instead.
      expect(button.parentElement).not.toBe(button.closest('[data-slot="field"]'));
    }

    fireEvent.click(screen.getByRole("button", { name: "Add condition: Title contains" }));

    expect(screen.getByRole("textbox", { name: "Title contains 1" })).toBeTruthy();
  });

  it("warns that recovery notifications are dropped when resolved is not selected", () => {
    renderEditForm({
      ...multiConditionRoute(),
      rule: { ...multiConditionRoute().rule, statuses: ["firing", "unknown"] },
    });

    expect(
      screen.getByText("Resolved is not included — recovery notifications will not be delivered"),
    ).toBeTruthy();
  });

  it("warns that trigger notifications are dropped when firing is not selected", () => {
    renderEditForm({
      ...multiConditionRoute(),
      rule: { ...multiConditionRoute().rule, statuses: ["resolved"] },
    });

    expect(
      screen.getByText("Firing is not included — trigger notifications will not be delivered"),
    ).toBeTruthy();
  });

  it("warns about both notification classes when only other states are selected", () => {
    renderEditForm({
      ...multiConditionRoute(),
      rule: { ...multiConditionRoute().rule, statuses: ["unknown"] },
    });

    expect(
      screen.getByText(
        "Neither Firing nor Resolved is included — trigger and recovery notifications will not be delivered",
      ),
    ).toBeTruthy();
  });

  it("stays quiet when the status condition covers both notification classes", () => {
    renderEditForm({
      ...multiConditionRoute(),
      rule: { ...multiConditionRoute().rule, statuses: ["firing", "resolved"] },
    });

    expect(screen.queryByText(/notifications will not be delivered/)).toBeNull();
  });

  it("stays quiet when no status condition is set", () => {
    renderEditForm({
      ...multiConditionRoute(),
      rule: { ...multiConditionRoute().rule, statuses: [] },
    });

    expect(screen.queryByText(/notifications will not be delivered/)).toBeNull();
  });

  it("edits the second entry of a class and leaves the first alone", async () => {
    const route = multiConditionRoute();

    const { onSubmit } = renderEditForm(route);
    fireEvent.change(screen.getByLabelText("Title contains 2"), {
      target: { value: "InodeFull" },
    });
    saveRoute();

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0]?.[0].rule).toEqual({
      ...route.rule,
      titleContains: ["DiskFull", "InodeFull"],
    });
  });

  it("removes the entry the operator removed and keeps its siblings", async () => {
    const route = multiConditionRoute();

    const { onSubmit } = renderEditForm(route);
    fireEvent.click(screen.getByRole("button", { name: "Remove condition: Message contains 1" }));
    saveRoute();

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0]?.[0].rule.messageContains).toEqual(["filesystem"]);
    expect(screen.queryByDisplayValue("volume")).toBeNull();
  });

  it("adds a new entry to a condition class", async () => {
    const route = multiConditionRoute();

    const { onSubmit } = renderEditForm(route);
    fireEvent.click(screen.getByRole("button", { name: "Add condition: Message contains" }));
    fireEvent.change(screen.getByLabelText("Message contains 3"), {
      target: { value: "inode" },
    });
    saveRoute();

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0]?.[0].rule.messageContains).toEqual([
      "volume",
      "filesystem",
      "inode",
    ]);
  });

  it("reports a stored source the picker cannot offer instead of dropping it silently", async () => {
    const base = multiConditionRoute();
    const route: RouteDefinition = {
      ...base,
      rule: { ...base.rule, sourceIds: ["source-grafana", "source-retired"] },
    };

    const { onSubmit } = renderEditForm(route);

    // The notice names the exact stored value instead of only counting it.
    expect(
      screen.getByText(
        "This route references values that are no longer configured — they stay exactly as stored and have to be removed here before the route can be saved",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Sources: source-retired")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Source 2" }).textContent).toContain(
      "source-retired",
    );

    // The API rejects rules pointing at unknown sources, so the form refuses the
    // save and says what to do instead of dropping the condition behind the
    // operator's back.
    saveRoute();

    await waitFor(() => {
      expect(
        screen.getByText("Remove source conditions that no longer exist before saving"),
      ).toBeTruthy();
    });
    expect(onSubmit).not.toHaveBeenCalled();

    // Removing that condition is the explicit fix, and nothing else moves.
    fireEvent.click(screen.getByRole("button", { name: "Remove condition: Source 2" }));
    saveRoute();

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0]?.[0].rule.sourceIds).toEqual(["source-grafana"]);
  });

  it("refuses to save a label condition that is missing half of its value", async () => {
    const { onSubmit } = renderEditForm(multiConditionRoute());

    fireEvent.change(screen.getByLabelText("Label value 1"), { target: { value: "" } });
    saveRoute();

    await waitFor(() => {
      expect(screen.getByText("Fill both the label key and the label value")).toBeTruthy();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("discloses that queued deliveries are not re-matched by this edit", async () => {
    testState.queued = 2;

    const { queryClient } = renderEditForm(multiConditionRoute());

    expect(
      await screen.findByText(
        "Queued deliveries are not re-matched against the route — removing a destination here does not recall deliveries already queued for it",
      ),
    ).toBeTruthy();
    expect(screen.getByText("2 queued deliveries")).toBeTruthy();

    queryClient.clear();
  });
});
