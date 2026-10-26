// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { DeliveryDestinationConfigNotice } from "#/features/deliveries/ui/delivery-destination-config-notice";
import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";
import { AppIntlProvider } from "#/i18n/provider";

describe("delivery destination config notice", () => {
  afterEach(() => {
    cleanup();
  });

  it("warns when the destination was edited after the delivery finished", () => {
    renderNotice({
      destinationUpdatedAt: "2026-06-07T03:00:00.000Z",
      createdAt: "2026-06-07T00:00:00.000Z",
      finishedAt: "2026-06-07T00:02:00.000Z",
    });

    expect(screen.getByText("Destination changed after this delivery")).toBeTruthy();
    expect(
      screen.getByText(/The destination metadata below is projected from the target's current/),
    ).toBeTruthy();
    expect(screen.getByText(/Destination last changed/)).toBeTruthy();
  });

  it("stays silent when the destination has not changed since the delivery", () => {
    renderNotice({
      destinationUpdatedAt: "2026-06-07T00:00:30.000Z",
      createdAt: "2026-06-07T00:00:00.000Z",
      finishedAt: "2026-06-07T00:02:00.000Z",
    });

    expect(screen.queryByText("Destination changed after this delivery")).toBeNull();
  });

  it("compares a pending delivery against when it was enqueued", () => {
    renderNotice({
      destinationUpdatedAt: "2026-06-07T01:00:00.000Z",
      createdAt: "2026-06-07T00:00:00.000Z",
      finishedAt: null,
    });

    expect(screen.getByText("Destination changed after this delivery")).toBeTruthy();
  });
});

function renderNotice(input: {
  destinationUpdatedAt: string;
  createdAt: string;
  finishedAt: string | null;
}) {
  render(
    <AppIntlProvider locale="en-US">
      <DeliveryDestinationConfigNotice detail={detailFixture(input)} />
    </AppIntlProvider>,
  );
}

function detailFixture(input: {
  destinationUpdatedAt: string;
  createdAt: string;
  finishedAt: string | null;
}): DeliveryDetailData {
  return {
    job: { createdAt: input.createdAt, finishedAt: input.finishedAt },
    destinationUpdatedAt: input.destinationUpdatedAt,
  } as unknown as DeliveryDetailData;
}
