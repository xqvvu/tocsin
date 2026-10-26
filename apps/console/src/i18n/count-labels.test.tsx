// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { AppIntlProvider } from "#/i18n/provider";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * The list footers render `total` through the same translation function the
 * console uses. These keys carry ICU plural branches so the English UI does not
 * say "1 sources"; a plain `{total}` interpolation would regress silently.
 */
const COUNT_LABELS = [
  ["sources.table.pagination.range", "source", "sources"],
  ["destinations.table.pagination.range", "destination", "destinations"],
  ["routing.table.pagination.range", "route", "routes"],
  ["deliveries.table.range", "delivery", "deliveries"],
  ["events.table.range", "event", "events"],
  ["integrations.table.pagination.range", "Feishu app", "Feishu apps"],
  ["suppressions.table.pagination.range", "rule", "rules"],
  ["suppressions.hits.pagination.range", "delivery", "deliveries"],
] as const;

function CountLabels({ total }: { total: number }) {
  const t = useTranslations();

  return (
    <ul>
      {COUNT_LABELS.map(([key]) => (
        <li key={key} data-key={key}>
          {t(key, { total })}
        </li>
      ))}
    </ul>
  );
}

function renderLabels(locale: "en-US" | "zh-Hans", total: number) {
  const { container } = render(
    <AppIntlProvider locale={locale}>
      <CountLabels total={total} />
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

describe("list count labels", () => {
  it("inflects English nouns for one row", () => {
    const labels = renderLabels("en-US", 1);

    for (const [key, singular] of COUNT_LABELS) {
      expect(labels.get(key)).toBe(`1 ${singular}`);
    }
  });

  it("keeps English nouns plural for zero and many rows", () => {
    for (const total of [0, 7]) {
      const labels = renderLabels("en-US", total);

      for (const [key, , plural] of COUNT_LABELS) {
        expect(labels.get(key)).toBe(`${total} ${plural}`);
      }
    }
  });

  it("leaves Chinese count labels unchanged", () => {
    const labels = renderLabels("zh-Hans", 1);

    expect(labels.get("sources.table.pagination.range")).toBe("共 1 个告警源");
    expect(labels.get("deliveries.table.range")).toBe("1 条投递");
  });
});
