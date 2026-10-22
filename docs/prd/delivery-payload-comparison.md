# 投递详情的原始载荷与渲染载荷对照

> 状态：已交付（PR #153）。以下「问题」段保留交付前的现状记录。

## 问题

投递详情「载荷」标签页只渲染 `renderedPayload`
（`apps/console/src/features/deliveries/ui/delivery-detail-view.tsx`），
但 `DeliveryDetail` DTO 同时包含事件记录 `event.rawPayload`
（`packages/core/src/operations.ts`）。值班工程师排查「目标系统收到的内容和
上游发来的内容是否一致」时，只能跳到事件详情页手工比对，或者在两个页面之间来回切换。

更隐蔽的问题是保留策略：原始载荷被清理后，`event.rawPayload` 会变成内部哨兵
`{"retentionPruned":true}`（`apps/console/src/infra/sqlite/repositories/intake/intake.helpers.ts`
的 `isPrunedRawPayload`）。事件详情已经用 `rawPayloadPruned` 派生字段把这种状态
显式呈现（`docs/prd/raw-payload-pruned-state.md`），但投递详情没有对应字段；
直接渲染原始载荷会把持久化哨兵当成上游真实发送的数据。

## 用户故事

作为值班工程师，我打开一条投递，希望在同一个标签页里回答：

1. 上游告警源上报的原始字段是什么？
2. Tocsin 按通知目标模板渲染后实际发送了什么？
3. 如果原始载荷已被保留策略清理，页面要明确说明，而不是显示一个假的 JSON 对象。

## 范围

- `DeliveryDetail` 新增派生字段 `rawPayloadPruned: boolean`，与 `EventDetail` 同名同义，
  由服务端用 `isPrunedRawPayload` 判定，客户端不自行猜测。
- 「载荷」标签页改为左右两栏：
  - 左：原始告警载荷 `event.rawPayload`；
  - 右：渲染载荷 `renderedPayload`。
- 原始载荷已清理时，左栏替换为清理说明（复用保留策略清理的文案口径），
  右栏仍然展示渲染载荷。
- 顶部增加一句中性说明，解释左右两栏各自的含义。

## 非目标

- 不改变保留策略、清理时机或清理范围。
- 不新增 oRPC procedure；只扩展现有 `DeliveryDetail` 投影。
- 不展示 `rawHeaders`；本切片只对照载荷，请求头属于接入侧排障。
- 不修改投递、模板渲染或重试语义。
- 不引入新的持久化字段或迁移。

## 验收标准

1. 原始载荷保留时：左右两栏分别显示「原始告警载荷」与「渲染载荷」，内容与 DTO 一致。
2. 原始载荷已清理时：左栏显示「原始载荷已清理」说明，页面文本不出现 `retentionPruned`；
   右栏仍显示渲染载荷。
3. 渲染载荷为 `null` 时：右栏显示空对象 `{}`，与改动前行为一致。
4. 服务端 `DeliveryDetail` 与 API schema 均包含 `rawPayloadPruned`，类型检查通过。
5. `vp check`、`vp run -r test`、`vp run -r build` 全绿。

## 架构边界

- 派生字段在 SQLite repository 的详情投影中计算
  （`apps/console/src/infra/sqlite/repositories/delivery/delivery.repository.ts`），
  复用 `isPrunedRawPayload`，不复制哨兵判定逻辑。
- 契约类型与 schema 分别位于 `packages/core/src/operations.ts` 与
  `packages/api/src/schemas/operations.ts`。
- UI 组件放在 `features/deliveries/ui/`：`delivery-payload-tab.tsx` 负责布局，
  `delivery-payload-pruned-notice.tsx` 负责清理说明。
- 不涉及迁移、鉴权边界、投递语义或新的服务端依赖。
