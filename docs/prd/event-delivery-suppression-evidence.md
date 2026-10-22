# 事件详情投递表的静默证据

- 状态：已实现（第 72 轮，需求切片）
- 相关代码：`apps/console/src/features/events/ui/event-detail-deliveries-table.tsx`、
  `apps/console/src/features/events/ui/event-detail-delivery-suppression-cell.tsx`
- 相关文档：`docs/prd/alert-suppression.md`、`docs/prd/delivery-suppression-check-evidence.md`

## 问题

一次告警进来后，值班 SRE 最常问的两个问题是「为什么没发」和「它命中了哪条规则」。
事件详情页是回答这两个问题的主入口，但它的投递表只显示状态徽标：

- 投递表的状态列渲染 `DeliveryStateBadge`（`event-detail-deliveries-table.tsx:68-70`），
  `suppressed` 只表现为一个灰色徽标；
- 抑制原因快照 `suppressReason`、抑制时刻 `suppressedAt` 与规则外键 `suppressionId`
  已经随 `EventDetailDelivery extends DeliveryJob` 一起返回
  （`packages/core/src/delivery/delivery.ts:14-41`、`packages/core/src/operations.ts:89-98`），
  但事件详情页从未渲染它们；
- 同一个原因目前只出现在**投递详情**的 `DeliverySuppressionNotice` 里
  （`delivery-suppression-notice.tsx:25-32`），值班先要发现「这条投递被抑制了」，
  再点进投递详情才能看到原因，多一次跳转和一次上下文切换；
- 文档明确要求抑制证据在排障路径上可见（`docs/prd/alert-suppression.md` 的用户故事
  「为什么没发/命中了哪条规则」）。

结果是：事件详情表的 `suppressed` 行与 `succeeded` 行只差一个徽标，运维无法在同一屏内
区分「上游没告警」与「告警被我们主动静默」，也无法直接跳到规则。

## 用户故事

作为值班 SRE，我在事件详情页看到某条投递被抑制时，希望同一行内就能读到抑制原因，
并能直接点进那条静默规则，从而不再为了回答「为什么没发」而跳到投递详情页。

## 范围

- 在事件详情投递表新增一列「静默」，位置在「最后错误」之后、「操作」之前。
- 新增 `EventDetailDeliverySuppressionCell`（`features/events/ui/`），只读渲染：
  - 非 `suppressed` 行显示共享占位符 `-`；
  - `suppressed` 行显示 `suppressReason`（两行截断，`title` 保留全文）；
  - 原因为空时显示既有文案「没有记录原因快照」；
  - `suppressionId` 存在时渲染指向 `/suppressions/$suppressionId` 的链接；
    不存在时显示「规则已删除」，说明快照仍然保留。
- 复用 `packages/core` 已有的 DTO 字段，不新增 oRPC 过程、不改 service、不改仓储。
- 复用以 `deliveries.suppression.*` 开头的既有文案；仅新增表头与短文案两个键。
- 调整列宽以容纳新列，保持 `min-w` 表格在窄视口内横向滚动而非挤压。

## 非目标

- 不在事件详情重算抑制判定（逐项 checks 已在投递详情实现，见
  `docs/prd/delivery-suppression-check-evidence.md`）；本切片只展示抑制时刻的快照。
- 不新增投递列、不迁移、不回填历史数据。
- 不改抑制判定语义、投递语义或 oRPC contract。
- 不改投递详情页的 `DeliverySuppressionNotice`。
- 不为事件列表页新增抑制筛选（属 backlog 的独立候选）。

## 验收标准

- 被抑制的投递在事件详情表的新列中显示原因快照全文（截断展示，`title` 为全文）。
- 规则仍存在时该单元格包含可用链接，指向 `/suppressions/<id>`。
- 规则已删除（`suppressionId` 为 `null`）时显示「规则已删除」，不渲染链接。
- 未抑制的投递显示共享占位符 `-`，不影响既有优先级排序与重试按钮。
- `vp check`、`vp run -r test`、`vp run -r build` 通过。
