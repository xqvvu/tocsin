// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { DeliveryStateBadge } from "#/features/deliveries/ui/delivery-state-badge";
import { AppIntlProvider } from "#/i18n/provider";

function renderBadge(state: "failed" | "suppressed" | "succeeded"): HTMLElement {
  render(
    <AppIntlProvider locale="en-US">
      <DeliveryStateBadge state={state} />
    </AppIntlProvider>,
  );

  return screen.getByText(
    state === "failed" ? "Failed" : state === "suppressed" ? "Suppressed" : "Succeeded",
  );
}

describe("delivery state badge", () => {
  it("never renders a suppressed delivery with the failure treatment", () => {
    const suppressed = renderBadge("suppressed");
    const suppressedClassName = suppressed.className;

    document.body.innerHTML = "";

    // "We chose not to send" must not read as "sending broke" (PRD story 25).
    const failed = renderBadge("failed");

    expect(suppressedClassName).not.toBe(failed.className);
    expect(suppressedClassName).toContain("text-muted-foreground");
    expect(failed.className).toContain("text-destructive");
  });

  it("leaves the succeeded treatment untouched", () => {
    const suppressed = renderBadge("suppressed");
    const suppressedClassName = suppressed.className;

    document.body.innerHTML = "";

    const succeeded = renderBadge("succeeded");

    expect(succeeded.className).not.toBe(suppressedClassName);
  });
});
