import { describe, expect, it } from "vite-plus/test";

import {
  settingsPreferencesPanelClassName,
  settingsUiPanelClassName,
} from "#/features/configuration/model/settings-layout";

describe("settings layout", () => {
  // Regressions: at 390×844 the UI tab measured 651px clientHeight with 863px of
  // content and `overflow: hidden`, so the last runtime facts and the save
  // button were unreachable; later, at 1440×900 the added account-security
  // panel made the clipped preferences form collapse to a slit.
  it("lets the UI tab own the scroll at every breakpoint", () => {
    expect(settingsUiPanelClassName).toContain("overflow-y-auto");
    expect(settingsUiPanelClassName).not.toContain("sm:overflow-hidden");
  });

  it("keeps the preferences form at its natural height inside the scroller", () => {
    expect(settingsPreferencesPanelClassName).toContain("flex-none");
    expect(settingsPreferencesPanelClassName).not.toContain("sm:flex-1");
  });
});
