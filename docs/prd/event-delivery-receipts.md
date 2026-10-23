# 事件详情：投递回执

状态：已实现（第 92 轮）
编号：REQ-248
关联：REQ-47（投递详情外部引用）、REQ-21（事件按投递结果筛选）

## 问题

事件详情页要回答「这条告警到底发出去了没有、为什么失败」
（`docs/release/history-retention-and-snapshots.md:14`），但投递表只有目标、路由、状态、
尝试次数、下次重试、最近错误和静默（`apps/console/src/features/events/ui/event-detail-deliveries-table.tsx:37-52`）。

目标侧回执（`providerReference`）和最近响应状态只存在于**投递详情** DTO
（`packages/api/src/schemas/operations.ts:127-128`）；事件详情的投递投影只扩展了名称/类型/路由名
（`packages/core/src/operations.ts:103-112`、`packages/api/src/schemas/operations.ts:52-58`），
mapper 丢弃了已经查出的其余列（`apps/console/src/infra/sqlite/repositories/history/history.helpers.ts:12-19`）。

后果：值班 SRE 要确认「对方收到了吗」，必须为一次告警逐个打开 N 个投递详情页。
一次告警扇出到多个目标时，这正是事故中成本最高、最容易被跳过的动作。

## 用户故事

作为值班 SRE，我在事件详情页要一眼确认每个目标是否被对方接受、对方返回的响应码和回执时间，
并能复制外部消息引用，从而不必为一次告警打开 N 个投递详情页。

## 范围

- `EventDetailDelivery` 增加三个只读字段（`packages/core/src/operations.ts`）：
  - `providerReference`：目标侧消息句柄（如飞书 `message_id`），无则为 `null`；
  - `lastResponseStatus`：最近一次**已完成**尝试的 HTTP 状态码；
  - `lastResponseAt`：该尝试的完成时间。
- `@tocsin/api` 的 `EventDetailDeliverySchema` 同步这三个字段。
- 仓储在 `getEventDetail` 内用**一次** `delivery_id IN (...)` 读取出该事件所有投递的已完成尝试，
  按 `attempt_number` 倒序取每个投递的第一条；`running` 尝试没有响应，跳过。
- 事件详情投递表新增「回执」列：外部引用（可复制）+ `HTTP <status>` + 回执时间；
  无回执显示 `-`。表格最小宽度由 210 调整为 230，列宽重新分配。
- 中英文文案：`events.detail.deliveryHeaders.receipt`、`events.detail.receipt.httpStatus`、
  `events.detail.receipt.copyReference`。

## 非目标

- 不展示完整响应体、渲染载荷或请求头（仍留在投递详情）。
- 不在事件列表页展示回执（列表投影成本与密度不匹配；`REQ-12` 另行处理目标侧健康）。
- 不改投递状态机、重试、路由或鉴权；不改 worker 领取顺序。
- 不新增表、不迁移、不新增运行时依赖。
- 不做回执的批量导出（证据包已有独立 PRD）。

## 验收标准

1. 已成功投递显示最近一次完成的尝试状态码与外部引用（存在时），引用可复制。
2. 多次尝试时显示**最新**一条已完成尝试，而不是首次失败的状态码。
3. 仅有 `running` 尝试或从未投递时，三个字段均为 `null`，单元格显示 `-`。
4. 事件详情加载只新增一次有界查询，不随投递数量线性增长。
5. 返回的 DTO 通过 `EventDetailSchema` 校验。
6. 表格在 390px 宽度下不产生横向溢出（列宽合计 100%，表体可横向滚动）。

## 架构边界

`@tocsin/core` DTO → `@tocsin/api` schema → `history.repository` 只读投影 →
`features/events/ui` 渲染。仓储只读，新增查询命中 `delivery_attempts(delivery_id, attempt_number)`
唯一约束索引；服务层与 oRPC 契约无需改动，仍只返回脱敏后的 DTO。
