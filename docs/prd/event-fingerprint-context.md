# 事件详情：同指纹历史与变更对比

状态：已实现（第 93 轮）
编号：REQ-249
关联：REQ-6（指纹聚合排障视图）、REQ-16（按指纹静默）、FIX-2（搜索覆盖指纹）

## 问题

同一条告警反复触发是值班最常见的场景，但事件详情只展示当前这一条：

- 摘要区把 fingerprint 当作一个只读指标（`apps/console/src/features/events/ui/event-detail-summary.tsx:88-89`），
  标准化标签页也只是可复制字段（`apps/console/src/features/events/ui/event-normalized-tab.tsx:45-48`）；
- `EventDetail` 投影没有历史字段（`packages/core/src/operations.ts:79-101`、
  `packages/api/src/schemas/operations.ts:67-86`）。

后果：值班 SRE 想判断「这是新问题还是老问题又犯了」「这次是不是更严重」「标签有没有变」，
只能复制 fingerprint、回到事件列表、粘进搜索框，再逐条打开历史事件人工比对。
2026-10-23 的第 92 轮把投递回执带进了详情页，但「这条告警本身的历史」仍然缺失。

## 用户故事

作为值班 SRE，我在事件详情页要能直接看到该指纹此前出现过几次、最近一次是什么时候、
与上次相比严重程度/状态/标题/消息/标签有什么变化，并能点进任意一次历史事件，
从而在不离开详情页的情况下判断这是一次新故障还是旧故障的复发。

## 范围

- `@tocsin/core` 新增只读 DTO `EventFingerprintContext`：
  `fingerprint`、`earlierCount`、`previous`、`recent`（最多 5 条，最新在前）、
  `fieldChanges`、`labelChanges`；`EVENT_FINGERPRINT_CHANGE_FIELDS` 固定比较
  `severity/status/title/message`。
- `@tocsin/api` 新增 `EventFingerprintContextSchema`，oRPC 新增只读过程
  `operations.getEventFingerprintContext(eventId)`；事件不存在返回 `null`。
- `history` 仓储新增 `getEventFingerprintContext`：同 `source_id` + 精确 `fingerprint` +
  `received_at <= 当前事件` 且排除自身；前 5 条与总数分别是一次有界查询。
- 变更对比在服务端完成，并复用详情投影的脱敏规则
  （`redactNormalizedEvent`）：标题、消息、标签值先脱敏再比较，避免「两边都脱敏」被误报为变化。
- 事件详情新增「同指纹」标签页：出现次数、最近一次时间、「与上次相比」变更列表、
  最近 5 条历史事件表（可点击进入对应详情）。
- 首次出现时显示明确的空态，而不是一个空列表。
- 中英文文案 `events.detail.fingerprint.*`、`events.detail.tabs.fingerprint`。

## 非目标

- 不做跨告警源匹配：fingerprint 只在产生它的 provider 内有意义。
- 不做事件列表级的指纹聚合页、趋势图或 incident 分组（REQ-6 独立处理）。
- 不写任何数据：不创建静默、不补投、不改事件或投递。
- 不新增表、不迁移；复用既有索引 `idx_events_fingerprint_received_at`
  （`apps/console/src/infra/sqlite/migrate/schema.ts:250-253`）。
- 不在默认打开的标签页预取历史；只有打开「同指纹」标签页时才查询。

## 验收标准

1. 事件详情出现「同指纹」标签页；打开前不产生额外查询。
2. 历史事件按 `received_at` 倒序，最多 5 条；`earlierCount` 是全部更早同指纹事件数，
   不受 5 条上限影响。
3. 不同 `source_id` 或不同 `fingerprint` 的事件不进入上下文。
4. `fieldChanges` 只包含值确实变化的字段；`labelChanges` 区分新增（`previous: null`）、
   移除（`current: null`）与改值。
5. 标签键命中敏感词（如 `token`）时，值为 `[REDACTED]`，原文不出现在 DTO 中。
6. 首次出现时 `previous` 为 `null`、`recent` 为空，界面显示首次出现空态。
7. 事件不存在时过程返回 `null`，界面显示「该事件已不存在」。
8. DTO 通过 `EventFingerprintContextSchema` 校验；仓储用例覆盖上述分支。

## 架构边界

`@tocsin/core` DTO → `@tocsin/api` schema + contract → `history` 仓储只读投影 →
`OperationsService` 薄委托 → `server/orpc/features/operations/router.ts` →
`features/operations/api` queryOptions → `features/events/ui` 渲染。

仓储不写库、不调用路由或投递逻辑；服务不抛 `ORPCError`；浏览器只经 `#/lib/orpc` 访问。
索引 `(fingerprint, received_at)` 覆盖指纹与时间范围，`source_id` 作为同一索引扫描上的过滤条件。
