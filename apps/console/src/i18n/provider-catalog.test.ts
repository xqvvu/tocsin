import { describe, expect, it } from "vite-plus/test";

import { createDefaultProviderRegistry } from "@tocsin/providers";

import enUsMessages from "#/i18n/messages/en-US.json";

describe("provider catalog i18n", () => {
  it("keeps default provider manifest message keys backed by console messages", () => {
    const registry = createDefaultProviderRegistry();
    const messageKeys = new Set(Object.keys(enUsMessages));

    expect(registry.audit({ messageKeys })).toEqual({ warnings: [] });
  });
});
