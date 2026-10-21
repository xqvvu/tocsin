import { describe, expect, it } from "vite-plus/test";

import { deliveriesTableMinWidthClassName } from "#/features/deliveries/ui/deliveries-table-layout";
import { eventsTableMinWidthClassName } from "#/features/events/ui/events-table-layout";

// The dashboard sidebar leaves a 982px-wide table viewport at 1280x900 with
// the sidebar expanded. A wider floor pushes the last data column under the
// sticky actions column, where the operator cannot scroll it back into view.
const narrowLaptopViewportPx = 982;

function minWidthPx(className: string): number {
  const match = /min-w-(\d+)/.exec(className);

  if (!match) {
    throw new Error(`missing min-w-* utility in "${className}"`);
  }

  // Tailwind v4 spacing scale: one unit is 4px.
  return Number(match[1]) * 4;
}

describe("operations table minimum widths", () => {
  it("keeps the events table inside the narrow laptop viewport", () => {
    expect(minWidthPx(eventsTableMinWidthClassName)).toBeLessThanOrEqual(narrowLaptopViewportPx);
  });

  it("keeps the deliveries table inside the narrow laptop viewport", () => {
    expect(minWidthPx(deliveriesTableMinWidthClassName)).toBeLessThanOrEqual(
      narrowLaptopViewportPx,
    );
  });
});
