# 静默规则影响面汇总

状态：已实现（第 186 轮，REQ-24）。

## 问题

静默规则详情页目前只有「已静默通知」的分页列表与总条数
（`apps/console/src/features/suppressions/ui/suppression-detail-page.tsx:35-43`），
运维在维护窗口结束复盘时，只能逐页翻看并人工汇总：

- 这条规则一共静默了多少条通知；
- 涉及多少个不同的告警事件、告警源和通知目标；
- 哪些目标受影响最大；
- 窗口内首次、最近一次静默分别发生在什么时候。

维护窗口越长、规则范围越宽，复盘成本越高，也越容易漏判「误静默了关键目标」。

## 用户故事

作为值班工程师，在维护窗口结束后，我希望在规则详情页直接看到这条规则的影响面汇总
（通知数、去重后的告警/告警源/目标数、首末静默时间、按严重级别与目标的数量分布），
以便快速确认没有误静默关键告警，并把复盘结论写进变更记录。

## 范围

- 新增只读 oRPC `suppressions.impact`，输入为规则 id，输出：
  - `deliveryCount`：被该规则静默的通知条数；
  - `eventCount` / `sourceCount` / `destinationCount`：去重后的告警、告警源、通知目标数；
  - `firstHitAt` / `lastHitAt`：静默发生时间（`deliveries.created_at`）的最小/最大值；
  - `severities`：按告警严重级别的数量分布，按固定顺序 critical → warning → info → unknown；
  - `destinations`：按通知目标的数量分布，最多 8 个，数量降序、名称升序。
- 规则详情页新增「影响面」面板：汇总数字、首末静默时间、严重级别徽标、目标分布；
  无静默记录时显示空态；目标超过 8 个时显示「另有 N 个目标」。
- 查询谓词与「已静默通知」列表一致：`deliveries.suppression_id = :id`。
- 规则不存在时返回 404（与 hits 一致）。

## 非目标

- 不改 schema、不迁移、不改投递/路由/静默匹配语义。
- 不做图表、导出、按路由或按标签的分布。
- 不聚合已删除规则：删除规则时 `suppression_id` 置空
  （`migrate/ensure-complete-schema.ts:182` 的 `ON DELETE SET NULL`），
  历史审计证据仍保留在投递行的 `suppress_reason` 快照上。

## 验收标准

- 汇总计数与 hits 列表同谓词；同一时刻查询时 `deliveryCount` 等于 hits 的 `total`。
- 无静默记录时所有计数为 0、`firstHitAt` / `lastHitAt` 为 `null`，UI 显示空态。
- 严重级别分布按 critical → warning → info → unknown 固定顺序返回。
- 目标分布按数量降序；超过 8 个目标时只展示 8 个，并给出剩余目标数。
- 规则 id 不存在时 procedure 返回 404。
- 仓储聚合、服务 NOT_FOUND、面板渲染均有测试。

## 架构边界

- 契约与 wire schema：`packages/api/src/schemas/suppressions.ts`、
  `packages/api/src/contract/suppressions.ts`。
- 聚合 SQL：`apps/console/src/infra/sqlite/repositories/history/history.repository.ts`
  （投递历史归 history 仓储，与 `destinationDeliveryHealth` 同层）。
- 业务校验（规则必须存在）：`apps/console/src/server/suppressions/suppression.service.ts`。
- 入口：`apps/console/src/server/orpc/features/suppressions/router.ts`。
- UI：`apps/console/src/features/suppressions/ui/suppression-impact-panel.tsx`，
  详情页通过 `features/suppressions/api/suppression.queries.ts` 的 queryOptions 拉取。
- 无 schema/迁移、无新依赖、无新可部署服务。
