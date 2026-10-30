import { describe, expect, it } from "vite-plus/test";

import { readProviderAlertCount } from "#core/event/event";
import type { JsonObject } from "#core/json";

describe("provider alert counts", () => {
  it("reads the group size a parser recorded", () => {
    expect(readProviderAlertCount({ alertCount: 1 })).toBe(1);
    expect(readProviderAlertCount({ provider: "grafana", alertCount: 5 })).toBe(5);
  });

  it("ignores counts it cannot trust instead of inventing one", () => {
    const untrusted: JsonObject[] = [
      {},
      { alertCount: 0 },
      { alertCount: -3 },
      { alertCount: 2.5 },
      { alertCount: Number.NaN },
      { alertCount: "5" },
      { alertCount: null },
      { alertCount: { value: 5 } },
    ];

    for (const providerMetadata of untrusted) {
      expect(readProviderAlertCount(providerMetadata)).toBeUndefined();
    }
  });
});
