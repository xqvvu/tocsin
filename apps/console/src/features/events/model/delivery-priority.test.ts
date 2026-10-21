import { describe, expect, it } from "vite-plus/test";

import {
  deliveryStatePriority,
  sortDeliveriesByOperationalPriority,
} from "#/features/events/model/delivery-priority";

describe("delivery operational priority", () => {
  it("ranks failed deliveries ahead of in-flight and settled states", () => {
    expect(deliveryStatePriority("failed")).toBeLessThan(deliveryStatePriority("running"));
    expect(deliveryStatePriority("running")).toBeLessThan(deliveryStatePriority("pending"));
    expect(deliveryStatePriority("pending")).toBeLessThan(deliveryStatePriority("succeeded"));
    expect(deliveryStatePriority("succeeded")).toBeLessThan(deliveryStatePriority("suppressed"));
  });

  it("orders deliveries by state without reordering equal states", () => {
    const deliveries = [
      { id: "succeeded-old", state: "succeeded" as const },
      { id: "failed-old", state: "failed" as const },
      { id: "pending-only", state: "pending" as const },
      { id: "succeeded-new", state: "succeeded" as const },
      { id: "failed-new", state: "failed" as const },
    ];

    expect(sortDeliveriesByOperationalPriority(deliveries).map((delivery) => delivery.id)).toEqual([
      "failed-old",
      "failed-new",
      "pending-only",
      "succeeded-old",
      "succeeded-new",
    ]);
  });

  it("leaves the caller's array untouched", () => {
    const deliveries = [
      { id: "suppressed", state: "suppressed" as const },
      { id: "failed", state: "failed" as const },
    ];

    sortDeliveriesByOperationalPriority(deliveries);

    expect(deliveries.map((delivery) => delivery.id)).toEqual(["suppressed", "failed"]);
  });
});
