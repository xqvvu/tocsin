# 静默命中列表显示告警身份

> 状态：已实现（2026-10-19，第 23 轮）。
> 相关：`docs/prd/alert-suppression.md` 故事 24；`REQ-27` 投递列表告警身份。

## 问题

静默规则详情页的「静默命中」表只显示告警源名和事件 ID：

- `suppression-hits-table.tsx` 的事件列把 `sourceName` 作为主文本，
  事件 ID 作为次要文本；
- 排序与投递列表一致，但投递列表早已通过 `DeliveryEventCell` 展示严重程度、
  标题与告警状态（`REQ-27`）。

值班同学在复盘维护窗口时，需要一眼判断「被静默的是哪条告警、严重程度如何」。
当前必须逐条打开事件详情，命中条数一多就退化成手工巡检。

## 用户故事

作为值班 SRE，我在复盘一次静默规则的命中记录时，希望命中列表直接显示每条告警的
严重程度、标题、告警源与 firing/resolved 状态，这样我可以在列表层面判断静默是否
误伤，而不必逐条打开事件。

## 范围

- 静默命中表的事件列改为与投递列表一致的告警身份单元：
  - 严重程度徽标（复用 `SeverityBadge`）；
  - 告警标题，链接到事件详情；
  - 次要行：告警源 · 告警状态 · 事件 ID。
- 新增 `features/suppressions/ui/suppression-hit-event-cell.tsx`，
  一个文件一个导出组件，遵循 feature `ui/` 约定。
- 调整命中表列宽，给事件列更多空间。
- 补组件测试：断言标题、严重程度、告警状态与事件 ID 均出现；
  空态行为不变。

## 非目标

- 不改 oRPC contract、DTO 或仓储查询；`DeliveryListItem` 已包含
  `eventTitle/eventSeverity/eventStatus`。
- 不新增筛选、排序、分页或导出能力。
- 不改变静默匹配、投递或 suppress 语义。
- 不把投递 feature 的 `DeliveryEventCell` 提升为跨 feature 公共组件；
  两个 feature 各自持有展示单元，避免 `components/common` 承载业务字段。

## 验收标准

- [x] 命中行显示严重程度徽标、告警标题、告警源、告警状态与事件 ID。
- [x] 标题可导航到 `/events/$eventId`。
- [x] 空态文案与分页行为不变。
- [x] `suppression-hits-table.test.tsx` 覆盖新增字段。
- [x] `vp check` / `vp run -r test` / `vp run -r build` 通过。

## 架构边界

- 纯前端 feature UI 改动，无 server/contract/迁移变化。
- 复用 `SeverityBadge`（`features/events/ui`）与既有 i18n 键
  `common.severity.*`、`common.alertStatus.*`。
- 不引入新依赖、新状态库或新样式系统。
