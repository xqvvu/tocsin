import { describe, expect, it } from "vite-plus/test";

import { createDefaultDestinationRegistry } from "@tocsin/destinations";

import enUsMessages from "#/i18n/messages/en-US.json";
import zhHansMessages from "#/i18n/messages/zh-Hans.json";

describe("destination catalog i18n", () => {
  it("keeps default destination manifest message keys backed by both locales", () => {
    const enUsKeys = new Set(Object.keys(enUsMessages));
    const zhHansKeys = new Set(Object.keys(zhHansMessages));
    const messageKeys = destinationManifestMessageKeys();

    expect(messageKeys.length).toBeGreaterThan(0);
    expect(messageKeys.filter((key) => !enUsKeys.has(key))).toEqual([]);
    expect(messageKeys.filter((key) => !zhHansKeys.has(key))).toEqual([]);
  });

  it("backs the Slack blocks template mode label in both locales", () => {
    expect(enUsMessages["destinations.form.templateModeSlackBlocks"]).toBe("Slack blocks");
    expect(zhHansMessages["destinations.form.templateModeSlackBlocks"]).toBeTruthy();
  });
});

/**
 * Every message key a destination manifest can reference, collected straight
 * from the registry so a new mode or field without translations fails the gate
 * instead of rendering a raw key in the console.
 */
function destinationManifestMessageKeys(): string[] {
  const keys: string[] = [];

  for (const adapter of createDefaultDestinationRegistry().list) {
    const manifest = adapter.manifest;

    keys.push(
      manifest.displayNameKey,
      manifest.descriptionKey ?? "",
      manifest.lifecycle.messageKey ?? "",
    );

    for (const field of manifest.configFields) {
      keys.push(field.labelKey, field.descriptionKey ?? "", field.placeholderKey ?? "");

      if (field.type === "template") {
        for (const mode of field.modes ?? []) {
          keys.push(mode.labelKey ?? "", mode.descriptionKey ?? "");

          if (mode.help) {
            keys.push(mode.help.labelKey, mode.help.descriptionKey ?? "");

            for (const link of mode.help.links ?? []) {
              keys.push(link.labelKey ?? "");
            }
          }
        }

        if (field.help) {
          keys.push(field.help.labelKey, field.help.descriptionKey ?? "");

          for (const link of field.help.links ?? []) {
            keys.push(link.labelKey ?? "");
          }
        }
      }

      if (field.type === "select") {
        for (const option of field.options) {
          keys.push(option.labelKey);
        }
      }
    }

    for (const secretField of manifest.secretFields) {
      keys.push(secretField.labelKey ?? "");
    }
  }

  return keys.filter(Boolean);
}
