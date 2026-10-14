import { describe, expect, it } from "vite-plus/test";

import { getMessages } from "#/i18n/messages";
import enUsMessages from "#/i18n/messages/en-US.json";
import zhHansMessages from "#/i18n/messages/zh-Hans.json";

describe("i18n messages", () => {
  it("keeps zh-Hans keys in parity with en-US", () => {
    expect(Object.keys(zhHansMessages).sort()).toEqual(Object.keys(enUsMessages).sort());
  });

  // oxlint-disable-next-line vitest/expect-expect
  it("keeps locale source files flat", () => {
    expectFlatMessages(enUsMessages);
    expectFlatMessages(zhHansMessages);
  });

  // oxlint-disable-next-line vitest/expect-expect
  it("keeps translatable prose free of sentence periods", () => {
    expectNoSentencePeriods(enUsMessages);
    expectNoSentencePeriods(zhHansMessages);
  });

  it("uses plain operator-facing Chinese for alert silences", () => {
    expect(zhHansMessages["common.routes.suppressions"]).toBe("告警静默");
    expect(zhHansMessages["suppressions.kind.silence"]).toBe("临时静默");
    expect(zhHansMessages["suppressions.kind.maintenance_window"]).toBe("维护时段");
    expect(zhHansMessages["suppressions.form.emptyMatcher.title"]).toBe("这条规则会影响所有告警");

    const suppressionCopy = Object.entries(zhHansMessages)
      .filter(([key]) => key.startsWith("suppressions."))
      .map(([, value]) => value)
      .join(" ");

    // These are implementation jargon rather than words an operator needs in
    // the UI; the domain may retain its English/API name, the copy should not.
    expect(suppressionCopy).not.toContain("抑制");
    expect(suppressionCopy).not.toContain("投递");
    expect(suppressionCopy).not.toContain("静默一切");
  });

  it("expands flat source files for use-intl runtime lookup", () => {
    expect(getMessages("en-US")).toMatchObject({
      common: {
        actions: {
          refresh: "Refresh",
        },
      },
    });
  });
});

function expectFlatMessages(messages: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(messages)) {
    expect(key).toContain(".");
    expect(value).toEqual(expect.any(String));
  }
}

function expectNoSentencePeriods(messages: Record<string, unknown>): void {
  const violations = Object.entries(messages)
    .filter(([, value]) => typeof value === "string")
    .flatMap(([key, value]) => {
      const message = value as string;

      if (isNonProseValue(message)) {
        return [];
      }

      const hasSentencePeriod = /[。；]|;|\.(?:\s|$)/.test(message);

      return hasSentencePeriod ? [`${key}: ${message}`] : [];
    });

  expect(violations).toEqual([]);
}

function isNonProseValue(message: string): boolean {
  return (
    message === "" ||
    message.includes("\n") ||
    /^[\w.+-]+@[\w.-]+$/.test(message) ||
    /^https?:\/\//.test(message)
  );
}
