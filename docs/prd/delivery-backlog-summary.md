# 暂停期间的可领取积压摘要

- 状态：已实现（第 67 轮，NEW-AH）
- 相关代码：`apps/console/src/features/deliveries/ui/deliveries-paused-notice.tsx`、
  `apps/console/src/infra/sqlite/repositories/delivery/delivery.repository.ts`、
  `apps/console/src/server/operations/operations.service.ts`、
  `apps/console/src/server/orpc/features/operations/router.ts`、
  `packages/api/src/contract/operations.ts`
- 前置：`docs/prd/delivery-resume-disclosure.md`（恢复前的加急影响披露）

## 问题

全局暂停只阻止 Worker 领取任务（`delivery-worker.service.ts:60-76`）。恢复后 Worker 立即
按批领取，积压的旧告警会在几秒内集中发出；恢复确认框已经说明了这个后果
（`delivery-resume-dialog.tsx`），但操作员**看不到会发出多少条**：

- 暂停横幅只显示暂停时间（`deliveries-paused-notice.tsx:34-44`）；
- 第一次领取后的健康快照只在手动运行 Worker 的响应里（`packages/api/src/contract/operations.ts:84-87`），
  暂停期间根本不会产生；
- `operations.list` 的 `total` 是列表筛选结果，无法表达「Worker 真正可领取」：
  目标停用、路由停用、重试退避未到、重试次数用尽的 pending 行都不该计入。

结果是恢复前只能凭感觉判断，恢复后又无法解释为什么实际发送数少于队列总数。

## 用户故事

作为值班 SRE，我在暂停期间能直接看到「恢复后 Worker 会立即领取多少条」以及
「最早一条已经等了多久」，从而决定现在恢复、先处理停用目标，还是继续等待。

## 范围

- 新增只读投影 `operations.getDeliveryBacklog`，返回：
  - `claimable`：下一次 `claimNext` 会选中的投递数；
  - `oldestCreatedAt`：这些投递中最早的 `created_at`，队列为空时为 `null`。
- 谓词与 `claimNext` 完全一致：`state = pending`、目标启用、路由为空或启用、
  `next_attempt_at` 为空或已到、`attempt_count < max_attempts`。
- Deliveries 页暂停横幅在原有说明下增加一行：
  - 有积压：`恢复后将立即领取 {count} 条积压投递 · 最早一条已等待 {wait}`；
  - 无积压：`当前没有可领取的积压投递`；
  - 查询失败或加载中：静默，不破坏横幅。
- 查询仅在暂停时启用，30 秒刷新一次；等待时长随时间前进（复用 `useOperationalNow`）。
- 中英文案同步。

## 非目标

- 不改变 Worker 的领取批次、间隔或暂停语义。
- 不统计「被停用目标/路由滞留」的 pending 行；该场景已有投递滞留提示（REQ-7）。
- 不列出具体投递或目标，不做下钻页面。
- 不做数据库迁移，不新增表或列。
- 不把 claim-time 抑制预计算进投影：抑制在领取后按事件内容判定，无法用单条 SQL 等价表达。

## 验收标准

- 未暂停时横幅不渲染，也不发起 backlog 查询。
- 暂停且 `claimable > 0` 时，横幅显示条数与最早等待时长；`oldestCreatedAt` 为空或
  时钟不可用时退化为只显示条数。
- 暂停且 `claimable = 0` 时显示「当前没有可领取的积压投递」。
- 投影与 `claimNext` 在同一数据集上返回一致结果：停用目标、停用路由、未到退避时间、
  重试次数用尽的行均不计入；`oldestCreatedAt` 等于可领取行 `created_at` 的最小值。
- 暂停期间新增 pending 投递后，下一次刷新（≤30 秒）反映新条数。
- `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- 投影属于 operations 能力：仓储新增只读 `summarizeClaimable`，服务新增
  `getDeliveryBacklog`，oRPC 入口保持薄。
- DTO 类型放在 `@tocsin/core` 的 operations 模块，客户端与契约共用。
- 只读查询，无迁移、无新依赖、无缓存策略变化；查询键挂在既有 `operations` 命名空间下。
- 抑制规则仍在领取时判定，投影是**上界**而不是承诺；界面文案使用「可领取」而非「将发送」。
