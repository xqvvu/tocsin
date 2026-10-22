# 事件原始载荷清理状态

> 状态：已交付（PR #118）。以下「问题」段保留交付前的现状记录。

## 问题

- 原始载荷超过保留窗口后，清理逻辑会把 `raw_payload_json` 改写为内部哨兵
  `{"retentionPruned":true}`，并把请求头清空
  （`apps/console/src/infra/sqlite/repositories/intake/intake.helpers.ts:23-25`、
  `intake.repository.ts:105-153`）。
- 事件详情 DTO 只返回 `EventRecord`，没有表达「已清理」这一状态
  （`packages/core/src/operations.ts:55-72`、`packages/api/src/schemas/operations.ts:58-70`）。
- Raw 标签页把 `rawPayload` 当普通 JSON 渲染
  （`apps/console/src/features/events/ui/event-raw-tab.tsx`），值班 SRE 会看到
  `{ "retentionPruned": true }`，误以为上游系统真的发送了这个字段，从而在排障时
  怀疑告警源或解析器，而不是意识到数据已按保留策略清理。
- 请求头被清空后也没有任何解释，空对象与「上游确实没发请求头」无法区分。

## 用户故事

- 作为值班 SRE，我打开一条历史事件的 Raw 标签页时，如果原始数据已被保留策略清理，
  应看到明确说明「已清理」的状态，而不是一段看起来像上游载荷的 JSON。
- 作为值班 SRE，我需要知道标准化字段、路由匹配与投递记录不受清理影响，可以继续排障。
- 作为值班 SRE，我不需要看到内部哨兵字段，也不需要猜测空请求头的含义。

## 范围

- `EventDetail` 新增派生字段 `rawPayloadPruned: boolean`，由仓储在读取详情时根据
  哨兵值计算；API schema 同步声明。
- 新增精确匹配助手 `isPrunedRawPayload`：只有单键 `retentionPruned: true` 才视为哨兵，
  真实载荷中恰好带有同名字段但还有其他字段时仍按普通载荷处理。
- Raw 标签页在 `rawPayloadPruned === true` 时渲染单独的提示面板
  （标题 + 说明），不再渲染 JSON 代码块。
- 未清理的事件保持现有行为：显示脱敏说明与 Raw payload / Raw headers 两个代码块。
- 中英文文案同步。

## 非目标

- 不改变清理时机、批量上限、保留窗口或数据库中的哨兵内容。
- 不新增数据库字段、迁移或后台任务。
- 不在列表页或导出中暴露清理状态。
- 不恢复已清理的原始数据（数据不可逆丢失，属于保留策略的预期行为）。

## 验收标准

- 清理后读取事件详情：`rawPayloadPruned` 为 `true`；未清理事件为 `false`。
- 事件详情 Raw 标签页在清理后显示「原始数据已按保留策略清理」及说明，
  且页面文本中不出现 `retentionPruned`。
- 未清理事件的 Raw 标签页仍显示 Raw payload 与 Raw headers 两个代码块。
- 反序列化时真实载荷 `{ retentionPruned: true, title: "..." }` 不会被误判为已清理。
- 中英文 i18n key 对等。
- 现有清理仓储测试与新增断言全部通过。

## 架构边界

- `apps/console/src/infra/sqlite/repositories/intake/intake.helpers.ts`：哨兵定义与
  `isPrunedRawPayload` 纯函数，保持持久化细节在 infra 层。
- `apps/console/src/infra/sqlite/repositories/history/history.repository.ts`：
  `getEventDetail` 计算派生字段，不改写 `EventRecord`。
- `packages/core/src/operations.ts` 与 `packages/api/src/schemas/operations.ts`：
  共享 DTO 契约新增只读布尔字段。
- `apps/console/src/features/events/ui/event-raw-tab.tsx` 与新增
  `event-raw-pruned-notice.tsx`：仅负责展示分支，不解析哨兵。
- `apps/console/src/i18n/messages`：新增中英文文案。
- 无 `server/` service、oRPC procedure、数据库 schema 或投递语义改动。
