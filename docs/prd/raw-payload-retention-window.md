# 原始载荷保留窗口结束时间

状态：已交付（REQ-177，第 148 轮）

## 问题

事件详情「原始调试」页签与投递详情「载荷」页签只在**已经清理**之后才说明情况
（`features/events/ui/event-raw-tab.tsx`、`features/deliveries/ui/delivery-payload-tab.tsx`
分别渲染 `EventRawPrunedNotice` / `DeliveryPayloadPrunedNotice`）。清理动作本身不是定时任务，
而是搭在接入路径上：每条被接受的 Webhook 在事务里顺带按
`receivedAt + rawPayloadRetentionDays` 清一批（`server/intake/intake.service.ts:133-134,235-237`），
高流量之后还有一次补齐扫描（`infra/sqlite/repositories/intake/intake.repository.ts:143`）。

这带来两个值班视角的问题：

1. **看不到截止时间**。原始载荷是排障证据，也是「证据导出」的唯一来源；值班同学无法从界面上
   判断还剩多少时间可以导出，只能事后发现载荷已被清成 `retentionPruned` 占位符。
2. **到期不等于已清理**。告警源安静下来后没有新的接入请求，过期的载荷会一直留可读状态。
   UI 现在既不说「什么时候到期」，也不区分「尚未到期」与「已过期但清理任务还没跑到」。

## 用户故事

作为值班 SRE，我打开一条事件的「原始调试」页签，希望直接看到这条事件原始载荷的保留截止时间
（例如「保留至 2026-11-27 09:12 · 保留策略 30 天」），以便决定是否需要立刻导出证据；
如果已经超过窗口但还能读，我希望界面明确告诉我「已过期、等待后台清理」，而不是让我误以为
还有充足时间。投递详情的「载荷」页签同样需要这个信息，因为那是我复现「到底发了什么」的入口。

## 范围

- 新增纯函数 `rawPayloadRetentionWindow`（`apps/console/src/lib/raw-payload-retention.ts`）：
  由 `receivedAt`、`rawPayloadRetentionDays` 与当前时刻算出窗口结束时间与 `expired` 标记；
  输入不可用时返回 `null`，调用方据此不渲染。
- 新增共享提示组件 `RawPayloadRetentionNotice`
  （`apps/console/src/features/operations/ui/raw-payload-retention-notice.tsx`）：
  - 未到期：`原始载荷保留至 <时间> · 保留策略 N 天，到期后由后台清理任务惰性删除`；
  - 已过期：`已超过 N 天原始载荷保留窗口，等待后台清理任务处理，需要长期留存请先导出证据`；
  - 通过既有 `appSettingsQueryOptions()` 读取保留天数，`useQuery` + `retry: false`，
    读取中或失败时**不渲染提示、不阻塞页签**；
  - 时间戳复用 `OperationTimestamp`（客户端渲染 + 配置时区，避免 SSR 水合差异）。
- 事件「原始调试」页签与投递「载荷」页签接入该组件；投递页签在已清理时保留原有清理说明，
  不再承诺窗口。
- 中英文案（`common.rawPayloadRetention.*`）。

## 非目标

- 不改清理逻辑、清理批量、触发时机，也不改 `rawPayloadRetentionDays` 的设置界面。
- 不新增服务端 DTO 字段或 oRPC 契约：窗口结束时间由事件自身的 `receivedAt` 推导，
  不需要额外的数据库读取或迁移。
- 不发「即将过期」通知、不自动导出证据、不在列表页显示倒计时。
- 不做按事件的单条保全（见 REQ-295）。

## 验收标准

1. `rawPayloadRetentionWindow` 对 `retentionDays = 30` 的事件返回
   `receivedAt + 30 天` 的 ISO 时间；恰好等于截止时刻时 `expired = true`
   （与仓储 `received_at < cutoff` 的口径一致）。
2. `retentionDays` 缺失、为 0、非有限值，或 `receivedAt` 无法解析时返回 `null`。
3. 事件「原始调试」页签在载荷未清理时显示保留截止时间；已清理时只显示原有清理说明，
   不出现保留提示。
4. 投递「载荷」页签同上，且已清理时渲染载荷侧不受影响。
5. 设置尚未加载或读取失败时不渲染提示，原始载荷与渲染载荷照常展示。
6. 已过窗口但尚未清理的事件显示「已过期、等待后台清理」文案，不显示已过去的截止时间。
7. 中英文键值一一对应，中文文案不含 `raw payload` / `worker` 等英文实现词，且不含句号/分号。
8. `vp check`、`vp run -r test`、`vp run -r build` 全绿。

## 架构边界

- 纯展示切片：无 schema、无迁移、无依赖、无新端点、无鉴权变化。
- 共享计算放在 `apps/console/src/lib/`（环境中立，可在浏览器与测试中直接使用）。
- 读取保留天数复用既有 `features/configuration/api/configuration.queries.ts` 的
  `appSettingsQueryOptions()`；跨 feature 复用查询工厂与 `features/operations/ui` 组件
  在本仓库已有先例（`features/deliveries/ui/deliveries-paused-notice.tsx`、
  `features/suppressions/ui/*`）。
- 不把保留策略复制进 `@tocsin/core` 或 oRPC 契约：它是控制台对既有设置的解释，不是新的领域契约。
