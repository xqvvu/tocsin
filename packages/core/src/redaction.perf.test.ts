import { describe, expect, it } from "vite-plus/test";

import { redactCredentialText, redactText } from "#core/redaction";

const FORTY_KIB = 40 * 1024;
const ONE_MIB = 1024 * 1024;

function measure(value: string, redact: (input: string) => string): number {
  const startedAt = performance.now();
  redact(value);
  return performance.now() - startedAt;
}

function expectBounded(
  value: string,
  redact: (input: string) => string,
  budgetMs: number,
  label: string,
): string {
  const output = redact(value);
  const elapsed = measure(value, redact);

  expect(elapsed, `${label}: ${elapsed.toFixed(1)}ms`).toBeLessThan(budgetMs);

  return output;
}

/**
 * Regression gates for SEC-19. The previous regex implementation backtracked
 * over every prefix of a long identifier: 80 KiB took seconds and a 1 MiB
 * webhook could pin the single-process worker for minutes. The budgets are
 * deliberately far above the linear implementation (tens of milliseconds at
 * 1 MiB) and far below the quadratic one, so CI scheduling noise cannot flip
 * them while a real regression fails fast.
 *
 * Each case checks the smaller input first: a synchronous regression fails
 * within the 100 ms gate instead of running a 1 MiB quadratic scan.
 */
describe("redaction performance", () => {
  it("keeps dotted identifier scans linear for assignments and URLs", () => {
    const dotted = "a.".repeat(FORTY_KIB / 2);
    expectBounded(dotted, redactText, 100, "40 KiB dotted assignment scan");
    expectBounded(dotted, redactCredentialText, 100, "40 KiB dotted credential scan");

    const largeDotted = "a.".repeat(ONE_MIB / 2);
    expectBounded(largeDotted, redactText, 2_000, "1 MiB dotted assignment scan");
    expectBounded(largeDotted, redactCredentialText, 2_000, "1 MiB dotted credential scan");
  });

  it("does not rescan whitespace runs in unquoted values", () => {
    const spaced = `token=x${" ".repeat(FORTY_KIB)}yyy`;
    expectBounded(spaced, redactText, 100, "40 KiB whitespace value");

    const largeSpaced = `token=x${" ".repeat(ONE_MIB)}yyy`;
    expectBounded(largeSpaced, redactText, 2_000, "1 MiB whitespace value");
  });

  it("keeps long-prefix suffix keys covered without quadratic matching", () => {
    const longPrefix = `${"a.".repeat(FORTY_KIB / 2)}token=supersecret`;
    expect(expectBounded(longPrefix, redactText, 100, "40 KiB long prefix")).not.toContain(
      "supersecret",
    );

    const largePrefix = `${"a.".repeat(ONE_MIB / 2)}token=supersecret`;
    expect(expectBounded(largePrefix, redactText, 2_000, "1 MiB long prefix")).not.toContain(
      "supersecret",
    );
  });

  it("keeps URL userinfo redaction linear inside the intake path", () => {
    const url = `${"a.".repeat(FORTY_KIB / 2)}://user:supersecret@host`;
    expect(expectBounded(url, redactCredentialText, 100, "40 KiB userinfo")).not.toContain(
      "supersecret",
    );

    const largeUrl = `${"a.".repeat(ONE_MIB / 2)}://user:supersecret@host`;
    expect(expectBounded(largeUrl, redactCredentialText, 2_000, "1 MiB userinfo")).not.toContain(
      "supersecret",
    );
    expect(expectBounded(largeUrl, redactText, 2_000, "1 MiB userinfo via text")).not.toContain(
      "supersecret",
    );
  });

  it("handles a 1 MiB payload full of assignments", () => {
    const assignments = "token=supersecret ".repeat(ONE_MIB / 17);
    const output = expectBounded(assignments, redactText, 2_000, "1 MiB assignments");

    expect(output).not.toContain("supersecret");
    expect(output.startsWith("token=[REDACTED] ")).toBe(true);
  });

  it("handles 1 MiB of benign JSON text", () => {
    const json = `{"title":"${"a.".repeat(ONE_MIB / 2)}","note":"ok"}`;

    expectBounded(json, redactText, 2_000, "1 MiB benign JSON");
  });
});
