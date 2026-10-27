# 事件与投递详情三处互链

状态：已交付（PR #545）。以下“问题”描述保留为切片背景，三处入口现均为路由链接。

## 问题

排障时运维在「事件」和「投递」两个视角之间来回切换，但三个最常用的入口此前都只是纯文本：

- 投递列表的事件列（`apps/console/src/features/deliveries/ui/delivery-event-cell.tsx:41-43`）
  渲染事件 id 的 `<span>`，无法直接打开该事件。
- 投递详情「字段」区的 `eventId`（`apps/console/src/features/deliveries/ui/delivery-summary-tab.tsx:43-47`）
  同样是纯文本；想知道「这条投递对应哪个告警、是否还有其它目标」只能回到列表重新搜索。
- 事件详情的事件投递表（`apps/console/src/features/events/ui/event-detail-deliveries-table.tsx:70-72`）
  的目的一栏是纯文本；要查看某个目标的重试历史、出站请求与回执，只能记下 id 再去投递列表搜。

同一控制台里已有相反的例子：静默命中表提供了「查看」链接
（`apps/console/src/features/suppressions/ui/suppression-hits-table.tsx:86-93`），
同指纹历史表把事件 id 做成链接（`event-fingerprint-occurrences-table.tsx:64-71`）。
互链缺失使「事件 → 投递 → 重试历史 → 回到事件」这条最典型的排障路径在第 1 步和第 3 步断掉。

## 用户故事

作为值班工程师，我在事件详情里看到某条失败投递时，希望直接点开它的投递详情查看失败回执与
重试记录；在投递详情里，希望能一键回到触发它的告警事件，而不需要复制 id 再搜索。

## 范围

只在三个既有展示点加路由链接，不新增查询、字段或端点：

- `delivery-event-cell.tsx`：事件标题改为 `<Link to="/events/$eventId">`，保留 `truncate`、
  `title` 与字体；事件 id 仍以等宽文本展示，便于复制核对。
- `delivery-summary-tab.tsx`：`eventId` 字段值改为指向 `/events/$eventId` 的链接，保留 `mono`
  样式与 `hover:underline` 反馈。
- `event-detail-deliveries-table.tsx`：目的一栏的目标名改为指向 `/deliveries/$deliveryId` 的
  链接，保留 `truncate` 与 `title`。
- 三个组件对应的单元测试：断言链接目标（`href`）与可见文本不变。

## 非目标

- 不改事件/投递列表的列、筛选或分页。
- 不新增「相关投递」「相关事件」面板，也不改 `DeliveryDetailData` / `EventDetailData` 契约。
- 不改跳转后的默认页签、返回路径或面包屑。
- 不做整行可点击（行内已有重试、复制等交互，整行跳转会争抢点击目标）。

## 验收标准

1. 投递列表事件列的标题是可聚焦链接，指向 `/events/<eventId>`；事件 id 文本与 `title` 不变。
2. 投递详情的事件 id 是可聚焦链接，指向 `/events/<eventId>`。
3. 事件详情的投递表每行目标名是指向 `/deliveries/<deliveryId>` 的链接；被静默投递的规则链接
   与「规则已删除」文案行为不变。
4. 既有测试全部通过；三个组件新增的链接断言覆盖上述目标。
5. 链接沿用现有表格链接样式（`underline-offset-4 hover:underline`），不引入新颜色或图标。

## 架构边界

纯前端展示层改动，落在 `features/deliveries/ui` 与 `features/events/ui`；仅使用 TanStack Router 的
`Link`，不涉及 oRPC 契约、service、repository、SQLite、auth 或 i18n 文案键的新增。
