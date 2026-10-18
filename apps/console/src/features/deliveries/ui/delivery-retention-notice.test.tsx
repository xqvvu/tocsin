// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { DeliveryState } from "@tocsin/core";

import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";
import { DeliveryRetentionNotice } from "#/features/deliveries/ui/delivery-retention-notice";
import { AppIntlProvider } from "#/i18n/provider";

// The notice links to the destination and route pages; the link target is not
// what this unit test asserts, so a plain span keeps the router out of scope.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  ClientOnly: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe("delivery retention notice", () => {
  afterEach(() => {
    cleanup();
  });

  it("explains a pending delivery held by a disabled destination", () => {
    renderNotice({ destinationEnabled: false, routeEnabled: true });

    expect(screen.getByText("Delivery is held")).toBeTruthy();
    expect(
      screen.getByText(
        "The destination is disabled, so this delivery stays pending until it is re-enabled",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Open destinations")).toBeTruthy();
    expect(screen.queryByText("Open routes")).toBeNull();
  });

  it("explains a pending delivery held by a disabled route", () => {
    renderNotice({ destinationEnabled: true, routeEnabled: false });

    expect(
      screen.getByText(
        "The route is disabled, so this delivery stays pending until it is re-enabled",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Open routes")).toBeTruthy();
    expect(screen.queryByText("Open destinations")).toBeNull();
  });

  it("names both causes when the destination and the route are disabled", () => {
    renderNotice({ destinationEnabled: false, routeEnabled: false });

    expect(
      screen.getByText(
        "Both the destination and the route are disabled, so this delivery stays pending until both are re-enabled",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Open destinations")).toBeTruthy();
    expect(screen.getByText("Open routes")).toBeTruthy();
  });

  it("treats a manual delivery without a route as destination-only", () => {
    renderNotice({ destinationEnabled: false, routeEnabled: null });

    expect(
      screen.getByText(
        "The destination is disabled, so this delivery stays pending until it is re-enabled",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Open routes")).toBeNull();
  });

  it("stays silent when the delivery can still be claimed", () => {
    renderNotice({ destinationEnabled: true, routeEnabled: true });

    expect(screen.queryByText("Delivery is held")).toBeNull();
  });

  it("stays silent for a delivery that is no longer pending", () => {
    renderNotice({ state: "succeeded", destinationEnabled: false, routeEnabled: false });

    expect(screen.queryByText("Delivery is held")).toBeNull();
  });
});

function renderNotice(input: {
  state?: DeliveryState;
  destinationEnabled: boolean;
  routeEnabled: boolean | null;
}) {
  render(
    <AppIntlProvider locale="en-US">
      <DeliveryRetentionNotice detail={detailFixture(input)} />
    </AppIntlProvider>,
  );
}

function detailFixture(input: {
  state?: DeliveryState;
  destinationEnabled: boolean;
  routeEnabled: boolean | null;
}): DeliveryDetailData {
  return {
    job: { state: input.state ?? "pending" },
    destination: { enabled: input.destinationEnabled },
    route: input.routeEnabled === null ? null : { enabled: input.routeEnabled },
  } as unknown as DeliveryDetailData;
}
