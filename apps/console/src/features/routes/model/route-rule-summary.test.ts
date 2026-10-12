import { describe, expect, it } from "vite-plus/test";

import {
  buildRouteRuleChips,
  describeRouteRule,
  describeRule,
  type RouteRule,
  type RouteRuleSummaryCopy,
} from "#/features/routes/model/route-rule-summary";

const zhOpsCopy: RouteRuleSummaryCopy = {
  allEvents: "所有事件",
  source: "告警源",
  severity: "级别",
  status: "状态",
  labels: "标签",
  title: "标题含",
  message: "消息含",
  sourcesCount: (count) => `告警源 ${count} 个`,
  titleContains: "标题包含",
  messageContains: "消息包含",
  partSeparator: " · ",
  listSeparator: "、",
  severityLabel: (severity) =>
    ({ critical: "严重", warning: "警告", info: "信息", unknown: "未知" })[severity] ?? severity,
  statusLabel: (status) =>
    ({ firing: "触发中", resolved: "已恢复", unknown: "未知" })[status] ?? status,
};

const enOpsCopy: RouteRuleSummaryCopy = {
  allEvents: "All events",
  source: "Source",
  severity: "Severity",
  status: "Status",
  labels: "Labels",
  title: "Title",
  message: "Message",
  sourcesCount: (count) => `Sources: ${count}`,
  titleContains: "Title contains",
  messageContains: "Message contains",
  partSeparator: " · ",
  listSeparator: ", ",
  severityLabel: (severity) =>
    ({ critical: "Critical", warning: "Warning", info: "Info", unknown: "Unknown" })[severity] ??
    severity,
  statusLabel: (status) =>
    ({ firing: "Firing", resolved: "Resolved", unknown: "Unknown" })[status] ?? status,
};

const multiRule: RouteRule = {
  sourceIds: ["source-grafana", "source-am"],
  severities: ["critical", "warning"],
  statuses: ["firing"],
  labels: [
    { key: "team", operator: "equals", value: "sre" },
    { key: "service", operator: "contains", value: "api" },
  ],
  titleContains: ["LatencyHigh"],
  messageContains: ["timeout"],
};

describe("route rule summary", () => {
  it("builds operator-facing chips with localized labels and display values", () => {
    expect(
      buildRouteRuleChips(multiRule, (id) => (id === "source-grafana" ? "Grafana" : id), zhOpsCopy),
    ).toEqual([
      "告警源: Grafana",
      "告警源: source-am",
      "级别: 严重",
      "级别: 警告",
      "状态: 触发中",
      "team=sre",
      "service~api",
      "标题含: LatencyHigh",
      "消息含: timeout",
    ]);
  });

  it("describes multi-condition rules in Chinese SRE wording", () => {
    expect(describeRouteRule(multiRule, zhOpsCopy)).toBe(
      "告警源 2 个 · 级别: 严重、警告 · 状态: 触发中 · 标签: team=sre、service~api · 标题包含: LatencyHigh · 消息包含: timeout",
    );
  });

  it("describes multi-condition rules in English ops wording", () => {
    expect(describeRouteRule(multiRule, enOpsCopy)).toBe(
      "Sources: 2 · Severity: Critical, Warning · Status: Firing · Labels: team=sre, service~api · Title contains: LatencyHigh · Message contains: timeout",
    );
  });

  it("shows every stored entry of every condition class, not just the first", () => {
    const everyEntryRule: RouteRule = {
      sourceIds: ["source-grafana", "source-am"],
      severities: ["critical", "warning"],
      statuses: ["firing", "unknown"],
      labels: [
        { key: "team", operator: "equals", value: "sre" },
        { key: "service", operator: "contains", value: "api" },
      ],
      titleContains: ["LatencyHigh", "DiskFull"],
      messageContains: ["timeout", "volume"],
    };

    const chips = buildRouteRuleChips(
      everyEntryRule,
      (id) => (id === "source-grafana" ? "Grafana" : id),
      enOpsCopy,
    );

    // The rule summary is the read-only counterpart of the edit form, so it has
    // to account for every entry the form now shows.
    expect(chips).toEqual([
      "Source: Grafana",
      "Source: source-am",
      "Severity: Critical",
      "Severity: Warning",
      "Status: Firing",
      "Status: Unknown",
      "team=sre",
      "service~api",
      "Title: LatencyHigh",
      "Title: DiskFull",
      "Message: timeout",
      "Message: volume",
    ]);
  });

  it("falls back to all-events copy for empty catch-all rules", () => {
    expect(
      describeRouteRule(
        {
          sourceIds: [],
          severities: [],
          statuses: [],
          labels: [],
          titleContains: [],
          messageContains: [],
        },
        zhOpsCopy,
      ),
    ).toBe("所有事件");
  });

  it("keeps describeRule as English debug fallback driven by describeRouteRule", () => {
    expect(describeRule(multiRule)).toBe(
      "sources: 2 · severity: critical,warning · status: firing · labels: team=sre,service~api · title: LatencyHigh · message: timeout",
    );
  });
});
