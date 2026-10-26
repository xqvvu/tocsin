// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { DeletionImpact } from "@tocsin/core";

import { DeletionImpactNotice } from "#/components/common/deletion-impact-notice";

vi.mock("#/i18n/use-i18n", () => ({
  useTranslations: () => (key: string) => key,
}));

const IMPACT: DeletionImpact = {
  eventCount: 2,
  deliveryCount: 3,
  attemptCount: 4,
  oncallPingCount: 1,
};

describe("deletion impact notice", () => {
  afterEach(() => {
    cleanup();
  });

  it("announces the loading state with visible text inside a live region", () => {
    render(
      <DeletionImpactNotice
        impact={null}
        state="loading"
        confirmed={false}
        onConfirmedChange={vi.fn<(confirmed: boolean) => void>()}
      />,
    );

    // `getByRole("status")` only matches a live region; the loading copy has to
    // live inside it rather than in a detached sr-only span.
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("common.deletionImpact.loading");
    expect(screen.getByText("common.deletionImpact.loading")).toBeTruthy();
  });

  it("offers an in-place retry when the preview fails", () => {
    const onRetry = vi.fn<() => void>();

    render(
      <DeletionImpactNotice
        impact={null}
        state="error"
        confirmed={false}
        onConfirmedChange={vi.fn<(confirmed: boolean) => void>()}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("common.deletionImpact.errorTitle");
    fireEvent.click(screen.getByRole("button", { name: /common\.actions\.tryAgain/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("omits the retry action when the caller cannot retry", () => {
    render(
      <DeletionImpactNotice
        impact={null}
        state="error"
        confirmed={false}
        onConfirmedChange={vi.fn<(confirmed: boolean) => void>()}
      />,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("gates the acknowledgement behind the counted history", () => {
    const onConfirmedChange = vi.fn<(confirmed: boolean) => void>();

    render(
      <DeletionImpactNotice
        impact={IMPACT}
        state="ready"
        confirmed={false}
        onConfirmedChange={onConfirmedChange}
      />,
    );

    expect(screen.getByText("common.deletionImpact.events")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onConfirmedChange).toHaveBeenCalledWith(true);
  });
});
