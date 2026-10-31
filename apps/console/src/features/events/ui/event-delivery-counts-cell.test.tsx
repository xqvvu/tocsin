// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { EventDeliveryCountsCell } from "#/features/events/ui/event-delivery-counts-cell";
import { AppIntlProvider } from "#/i18n/provider";

// The cell renders inside the events table, whose real Link needs the app
// router. Rendering the anchor directly keeps the test on the cell's own
// behavior: which state opens which filtered delivery list.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    params,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to: string;
    search?: Record<string, string>;
    params?: Record<string, string>;
  }) => {
    const query = search ? `?${new URLSearchParams(search).toString()}` : "";
    const path = params
      ? Object.entries(params).reduce(
          (resolved, [key, value]) => resolved.replace(`$${key}`, value),
          to,
        )
      : to;

    return (
      <a href={`${path}${query}`} {...props}>
        {children}
      </a>
    );
  },
}));

const EMPTY_COUNTS = { pending: 0, running: 0, succeeded: 0, failed: 0, suppressed: 0 };

function renderCell(
  counts: typeof EMPTY_COUNTS,
  routeMatchCount: number,
  eventId = "evt-1",
  expectedDeliveryCount: number | null = null,
) {
  return render(
    <AppIntlProvider locale="en-US">
      <EventDeliveryCountsCell
        eventId={eventId}
        counts={counts}
        routeMatchCount={routeMatchCount}
        expectedDeliveryCount={expectedDeliveryCount}
      />
    </AppIntlProvider>,
  );
}

describe("event delivery counts cell", () => {
  afterEach(() => {
    cleanup();
  });

  it("counts a suppressed delivery toward the total and shows its badge", () => {
    renderCell({ ...EMPTY_COUNTS, suppressed: 2 }, 1);

    // The suppressed count is non-zero, so the cell must not fall back to the
    // bare "0" badge that a dropped state would produce.
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.getByText("Suppressed")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("links each state badge to this event's deliveries in that state", () => {
    renderCell({ ...EMPTY_COUNTS, failed: 3, suppressed: 2 }, 2, "evt-42");

    // The badge is the drill-down from "this alert produced 3 failed jobs" to
    // the exact rows; the event id and state both have to survive the link.
    expect(screen.getByText("Failed").closest("a")?.getAttribute("href")).toBe(
      "/deliveries?eventId=evt-42&deliveryState=failed",
    );
    expect(screen.getByText("Suppressed").closest("a")?.getAttribute("href")).toBe(
      "/deliveries?eventId=evt-42&deliveryState=suppressed",
    );
  });

  it("does not link the zero or unmatched-route badges", () => {
    const zero = renderCell(EMPTY_COUNTS, 1);

    // Zero rows means there is nothing to open; a link would promise a list
    // that is empty by construction.
    expect(zero.container.querySelector("a")).toBeNull();

    cleanup();
    const unmatched = renderCell(EMPTY_COUNTS, 0);

    expect(screen.getByText("No route matched")).toBeTruthy();
    expect(unmatched.container.querySelector("a")).toBeNull();
  });

  it("flags the deliveries the intake snapshot promised but did not create", () => {
    renderCell({ ...EMPTY_COUNTS, succeeded: 2 }, 2, "evt-42", 3);

    // The counts say "2 succeeded", but the rules selected 3 targets. The gap
    // badge is the only place that difference is visible in the list.
    const gap = screen.getByText("1 missing").closest("a");

    expect(gap?.getAttribute("href")).toBe("/events/evt-42");
    expect(gap?.getAttribute("title")).toBe(
      "The intake route snapshot promised 3 deliveries and 2 exist — fingerprint dedupe, a disabled route or target, or a deleted target explains the gap, and the event detail names the actual one",
    );
  });

  it("keeps the zero badge when nothing was delivered but targets were expected", () => {
    renderCell(EMPTY_COUNTS, 1, "evt-1", 2);

    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText("2 missing")).toBeTruthy();
  });

  it("stays silent when the snapshot is unknown or fully delivered", () => {
    const unknown = renderCell({ ...EMPTY_COUNTS, succeeded: 2 }, 2, "evt-1", null);

    // No intake snapshot means "we cannot tell", which must not render as a
    // gap. The same holds when every promised delivery exists.
    expect(unknown.queryByText(/missing/)).toBeNull();

    cleanup();
    const complete = renderCell({ ...EMPTY_COUNTS, succeeded: 2 }, 2, "evt-1", 2);

    expect(complete.queryByText(/missing/)).toBeNull();
  });
});
