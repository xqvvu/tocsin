# 事件详情内联重试失败投递

状态：已实现（REQ-136）。

## 问题

事件详情页的「投递」标签页列出了该事件产生的全部投递，但表格只有目标、路由、状态、尝试次数、
下次尝试与最近错误，没有任何操作列。值班 SRE 在复盘一次告警时，往往先打开事件详情确认影响面，
发现某个目标投递失败后，必须记住投递 ID、回到投递列表或投递详情页才能重试；投递一多就需要反复
跳转，排障节奏被打断。

投递详情页已经有重试按钮，投递列表也有同样的操作，缺的是「在事件上下文里直接修复」这一环。

## 用户故事

作为正在排障的值班 SRE，我在事件详情里看到某个目标投递失败时，希望直接在该行重试，
不必离开事件上下文，以便在确认影响面后立刻恢复投递。

## 范围

- 在事件详情的投递表格新增「操作」列。
- 仅 `failed` 状态的投递显示重试按钮；其他状态不显示，避免点击后才被服务端拒绝。
- 按钮复用既有 `DeliveryRetryButton` 与 `operations.retryDelivery`，成功后失效 operations
  查询，使表格状态与尝试次数刷新。
- 把 `DeliveryRetryButton` 的入参从完整 `DeliveryDetailData` 收敛为 `{ id, state }`，
  使详情页与事件表格共用同一组件。

## 非目标

- 不改变重试语义、重试次数、退避策略或服务端命令。
- 不新增批量重试（REQ-18）、失败投递按目标聚合（REQ-45）或目标诊断入口（REQ-50）。
- 不新增 oRPC procedure、DTO 字段、数据库迁移或环境变量。
- 不对成功/进行中的投递提供「再次发送」入口。

## 验收标准

1. 事件详情投递表格有「操作」列；存在失败投递时该行显示重试按钮。
2. 非 `failed` 状态的投递不显示按钮；空投递列表的空态跨列仍完整。
3. 点击重试调用 `operations.retryDelivery({ id })`，成功后刷新 operations 查询。
4. 重试失败时展示错误 toast，按钮恢复可用。
5. 投递详情页的重试行为保持不变，既有测试继续通过。

## 架构边界

- 纯前端：`features/events/ui/event-detail-deliveries-table.tsx`、
  `features/deliveries/ui/delivery-retry-button.tsx` 与对应 i18n 文案。
- 数据能力沿用 `features/operations/api/operation.mutations.ts` 的 `useOperationMutations`。
- 不触碰 `packages/core`、`packages/api`、server 服务、repository、schema 或迁移。
