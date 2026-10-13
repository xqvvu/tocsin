import { describe, expect, it } from "vite-plus/test";

import type { DestinationListItem } from "@tocsin/core";

import { emptySuppressionMatcher } from "#/features/suppressions/model/suppression-form";
import { urgentImpactPreview } from "#/features/suppressions/model/urgent-impact";

describe("urgent impact preview", () => {
  it("counts only enabled destinations that page automatically", () => {
    const preview = urgentImpactPreview(
      [
        destinationFixture({ id: "pager", urgentAutoEnabled: true }),
        destinationFixture({ id: "muted", urgentAutoEnabled: false }),
        destinationFixture({ id: "automatic-but-off", urgentAutoEnabled: true, enabled: false }),
      ],
      emptySuppressionMatcher(),
    );

    expect(preview.destinations.map((destination) => destination.id)).toEqual(["pager"]);
    expect(preview.scopedCount).toBe(2);
  });

  it("respects the destination scope but ignores event-only dimensions", () => {
    const destinations = [
      destinationFixture({ id: "in-scope", urgentAutoEnabled: true }),
      destinationFixture({ id: "out-of-scope", urgentAutoEnabled: true }),
    ];

    const scoped = urgentImpactPreview(destinations, {
      ...emptySuppressionMatcher(),
      destinationIds: ["in-scope"],
      severities: ["critical"],
      titleContains: ["DiskFull"],
    });

    expect(scoped.destinations.map((destination) => destination.id)).toEqual(["in-scope"]);
    expect(scoped.scopedCount).toBe(1);
  });

  it("treats an empty destination scope as every destination", () => {
    const preview = urgentImpactPreview(
      [
        destinationFixture({ id: "one", urgentAutoEnabled: true }),
        destinationFixture({ id: "two", urgentAutoEnabled: true }),
      ],
      emptySuppressionMatcher(),
    );

    expect(preview.destinations).toHaveLength(2);
  });
});

function destinationFixture(overrides: {
  id: string;
  urgentAutoEnabled: boolean;
  enabled?: boolean;
}): DestinationListItem {
  return {
    id: overrides.id,
    name: `Destination ${overrides.id}`,
    kind: "feishu",
    enabled: overrides.enabled ?? true,
    operationalConfig: {
      endpoint: null,
      host: null,
      method: null,
      to: null,
      from: null,
      replyTo: null,
      subjectPrefix: null,
      headerNames: null,
      templateConfigured: false,
      templateMode: null,
      templateSource: null,
      signingConfigured: false,
      secretFieldPaths: [],
      sendMode: "app",
      appRef: null,
      chatId: null,
      urgentAutoEnabled: overrides.urgentAutoEnabled,
      urgentReceivers: ["ou_1"],
    },
  };
}
