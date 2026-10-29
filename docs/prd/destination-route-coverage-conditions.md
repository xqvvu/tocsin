# 通知目标覆盖列区分条件路由

> 后续变更：本 PRD 中的「N 条生效」徽标已在 REQ-138（第 175 轮）改为
> 「N 条可达」，计数同时要求匹配的告警源启用。见
> `docs/prd/destination-route-coverage-source-availability.md`。

## 问题

通知目标（Destinations）列表的「路由覆盖」列只显示「N 条生效」，无法区分
「这 N 条路由会把该目标的全部流量投递过来」与「其中若干条只在事件满足级别、
状态、标签或文本条件时才投递」。告警源（Sources）列表在 REQ-210 之后已经用
`conditionSuffix` 标注了条件路由（`features/sources/model/source-route-coverage.ts:49-56`、
`features/sources/ui/source-route-coverage-cell.tsx:47-57`），通知目标侧仍只数总数
（`features/destinations/model/destination-route-coverage.ts:5-24`）。

运维后果：值班同学核对「这条飞书/邮件目标到底会收到哪些告警」时，看到
「3 条生效」会理解为该目标覆盖了全部流量，而实际上可能只有 1 条是无条件路由。
排障时容易漏掉「告警被条件路由挡在目标之外」这一层原因。

## 用户故事

作为值班 SRE，我在通知目标列表里看到覆盖徽标时，希望一眼分辨出覆盖里有多少条是
带条件的路由，并能在悬停提示里看到具体路由名，从而判断某个目标是否会漏收告警。

## 范围

- `DestinationRouteCoverage` 增加 `conditionalRouteCount` 与 `conditionalRouteNames`，
  只统计启用且引用该目标、且 `routeRuleHasEventConditions(rule)` 为真的路由。
- `DestinationRouteCoverageCell` 在存在条件路由时追加 ` · N 条带条件` 后缀，
  并在 `title` 中列出条件路由名称；无条件下标时文案与现状逐字一致。
- 中英文 i18n 各加两条 `destinations.table.routes.conditional{Suffix,Title}`，
  措辞与 Sources 侧保持一致。

## 非目标

- 不改 Sources 侧模型与徽标。
- 不引入服务端聚合 DTO、不新增 schema/迁移；数据仍由前端已有的 routes 列表计算。
- 不处理源启停可达性（REQ-138）与名单弹层（NEW-AQ）。
- 不改变路由匹配、投递或抑制语义。

## 验收标准

- 目标只有无条件路由时，徽标仍显示「N 条生效」，与改动前逐字一致。
- 目标存在条件路由时，徽标显示「N 条生效 · M 条带条件」，`title` 含中文条件说明与条件路由名。
- 停用路由不计入条件统计。
- 模型单测覆盖以上三种情形；卡片单测覆盖文案与 title。

## 架构边界

纯前端 feature 层改动：`features/destinations/model` 与 `features/destinations/ui`，
契约复用 `@tocsin/core` 的 `routeRuleHasEventConditions`，不触碰 server、oRPC、
持久化与 import protection 边界。
