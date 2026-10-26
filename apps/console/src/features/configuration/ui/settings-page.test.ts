import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), "settings-page.tsx");
const source = readFileSync(sourcePath, "utf8");

function panelIndex(panel: string): number {
  const index = source.indexOf(`<${panel} />`);

  expect(index, `${panel} should render on the settings page`).toBeGreaterThan(-1);

  return index;
}

describe("settings page panel order", () => {
  // "Sign out other devices" is incident response, not routine account
  // management. Keeping the account-security panel above the read-only runtime
  // diagnostics is what makes it reachable on the first screen; a later panel
  // insertion must not push it back below the fold.
  it("keeps the account-security panel above the read-only diagnostics", () => {
    const security = panelIndex("SettingsSecurityPanel");

    expect(security).toBeLessThan(panelIndex("SettingsRuntimePanel"));
    expect(security).toBeLessThan(panelIndex("SettingsWorkerHealthPanel"));
    expect(security).toBeLessThan(panelIndex("SettingsStoragePanel"));
    expect(security).toBeLessThan(panelIndex("SettingsPreferencesPanel"));
  });

  it("keeps the account-security panel next to the other writable control", () => {
    expect(panelIndex("SettingsDeliveryPausePanel")).toBeLessThan(
      panelIndex("SettingsSecurityPanel"),
    );
  });
});
