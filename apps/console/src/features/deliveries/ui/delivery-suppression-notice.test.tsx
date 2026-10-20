// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";
import { DeliverySuppressionNotice } from "#/features/deliveries/ui/delivery-suppression-notice";
import { AppIntlProvider } from "#/i18n/provider";

// The notice decides between a rule link and a "rule is gone" note; the link
// needs no router in this unit test.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  ClientOnly: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// The per-check evidence owns its own query-state test; this suite covers the
// reason snapshot, the rule link, and when the evidence is mounted at all.
vi.mock("#/features/deliveries/ui/delivery-suppression-checks", () => ({
  DeliverySuppressionChecks: () => <span>per-condition evidence</span>,
}));

const SUPPRESS_REASON =
  "Maintenance window 「October database migration」 matched destination in [destination-1]";

describe("delivery suppression notice", () => {
  afterEach(() => {
    cleanup();
  });

  it("explains why a suppressed delivery was not sent, snapshot included", () => {
    render(
      <AppIntlProvider locale="en-US">
        <DeliverySuppressionNotice
          detail={detailFixture({
            suppressionId: null,
            suppressReason: SUPPRESS_REASON,
            suppressedAt: "2026-10-12T10:00:00.000Z",
          })}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("Suppressed — deliberately not sent")).toBeTruthy();
    expect(screen.getByText(SUPPRESS_REASON)).toBeTruthy();
    expect(screen.getByText("Suppressed at:")).toBeTruthy();

    // The rule was deleted, so the FK is null; the snapshot is the audit trail.
    expect(screen.getByText("The rule no longer exists, the snapshot above is kept")).toBeTruthy();
    expect(screen.queryByText("per-condition evidence")).toBeNull();
  });

  it("points at the rule while the rule still exists", () => {
    render(
      <AppIntlProvider locale="en-US">
        <DeliverySuppressionNotice
          detail={detailFixture({
            suppressionId: "suppression-1",
            suppressReason: SUPPRESS_REASON,
            suppressedAt: "2026-10-12T10:00:00.000Z",
          })}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("suppression-1")).toBeTruthy();
    expect(screen.getByText("per-condition evidence")).toBeTruthy();
    expect(screen.queryByText("The rule no longer exists, the snapshot above is kept")).toBeNull();
  });
});

function detailFixture(job: {
  suppressionId: string | null;
  suppressReason: string | null;
  suppressedAt: string | null;
}): DeliveryDetailData {
  return { job } as unknown as DeliveryDetailData;
}
