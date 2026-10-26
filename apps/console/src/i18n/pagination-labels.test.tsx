// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { AppIntlProvider } from "#/i18n/provider";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Every list footer renders the page cursor through the same translation
 * function. The English wording drifted once already (`Page 1 / 1` on some
 * lists, `Page 1 of 1` on others), so the keys are asserted together.
 */
const PAGE_LABELS = [
  "deliveries.table.page",
  "destinations.table.pagination.page",
  "events.table.page",
  "integrations.table.pagination.page",
  "routing.table.pagination.page",
  "sources.table.pagination.page",
  "suppressions.hits.pagination.page",
  "suppressions.table.pagination.page",
] as const;

function PageLabels() {
  const t = useTranslations();

  return (
    <ul>
      {PAGE_LABELS.map((key) => (
        <li key={key} data-key={key}>
          {t(key, { page: 1, pageCount: 1 })}
        </li>
      ))}
    </ul>
  );
}

function renderLabels(locale: "en-US" | "zh-Hans") {
  const { container } = render(
    <AppIntlProvider locale={locale}>
      <PageLabels />
    </AppIntlProvider>,
  );

  const labels = new Map(
    Array.from(container.querySelectorAll<HTMLLIElement>("li[data-key]")).map((item) => [
      item.dataset.key,
      item.textContent,
    ]),
  );

  cleanup();
  return labels;
}

afterEach(cleanup);

describe("list pagination labels", () => {
  it("uses one English page wording across every list", () => {
    const labels = renderLabels("en-US");

    for (const key of PAGE_LABELS) {
      expect(labels.get(key)).toBe("Page 1 of 1");
    }
  });

  it("keeps the Chinese page wording unchanged", () => {
    const labels = renderLabels("zh-Hans");

    for (const key of PAGE_LABELS) {
      expect(labels.get(key)).toBe("第 1 / 1 页");
    }
  });
});
