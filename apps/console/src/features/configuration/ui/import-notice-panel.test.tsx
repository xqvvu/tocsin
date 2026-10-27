// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { ImportConfigurationResult } from "@tocsin/core";

import { ImportNoticePanel } from "#/features/configuration/ui/import-notice-panel";
import { AppIntlProvider } from "#/i18n/provider";

function noticeWith(count: number): ImportConfigurationResult {
  return {
    generatedSourceTokens: Array.from({ length: count }, (_, index) => ({
      sourceId: `bulk-src-${index + 1}`,
      sourceName: `批量告警源 ${index + 1}`,
      token: `tocsin_src_token_${index + 1}`,
    })),
  };
}

function renderNotice(notice: ImportConfigurationResult, onDismiss = vi.fn()) {
  render(
    <AppIntlProvider locale="zh-Hans">
      <ImportNoticePanel notice={notice} onDismiss={onDismiss} />
    </AppIntlProvider>,
  );

  return { onDismiss };
}

describe("import notice panel", () => {
  afterEach(() => {
    cleanup();
  });

  // A bulk import can mint dozens of one-time tokens. The list must scroll
  // inside the notice instead of growing the page until the editor's import
  // controls leave the viewport (UI-84).
  it("caps the generated-token list and lets it scroll", () => {
    renderNotice(noticeWith(8));

    const list = screen.getByText("批量告警源 1").closest("div.col-start-2");

    expect(list?.className).toContain("max-h-64");
    expect(list?.className).toContain("overflow-y-auto");
  });

  it("keeps every generated token rendered inside the list", () => {
    renderNotice(noticeWith(8));

    expect(screen.getByText("批量告警源 8")).toBeTruthy();
    expect(screen.getByText("tocsin_src_token_8")).toBeTruthy();
  });

  it("dismisses the notice only when the operator saved the tokens", () => {
    const { onDismiss } = renderNotice(noticeWith(2));

    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "我已保存" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
