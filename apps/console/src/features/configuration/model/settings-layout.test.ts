import { describe, expect, it } from "vite-plus/test";

import {
  settingsPreferencesPanelClassName,
  settingsUiPanelClassName,
} from "#/features/configuration/model/settings-layout";

describe("settings mobile layout", () => {
  // Regression: at 390×844 the UI tab panel measured 651px clientHeight with
  // 863px of content and `overflow: hidden`, so the last runtime facts and the
  // save button were unreachable by wheel or touch.
  it("lets the UI tab own the scroll below the sm breakpoint", () => {
    expect(settingsUiPanelClassName).toContain("overflow-y-auto");
    // Desktop keeps the original fixed-height composition once the stack fits.
    expect(settingsUiPanelClassName).toContain("sm:overflow-hidden");
  });

  it("keeps the preferences form at its natural height inside the mobile scroller", () => {
    expect(settingsPreferencesPanelClassName).toContain("flex-none");
    expect(settingsPreferencesPanelClassName).toContain("sm:flex-1");
  });
});
