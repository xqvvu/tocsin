# 加急呼叫成功后持久化失败的处理

- 状态：已决（2026-10-20，第 24 轮）
- 关联：backlog `Q-30`
- 决策方式：EXPERT_PANEL 三位专家独立评审（安全与可靠性 / 产品与运维 / 独立评估者）

## 问题

`OncallExecution.execute` 在服务商已受理加急呼叫后调用 `markFired`
（`apps/console/src/server/oncall/oncall-execution.ts:97`），该调用位于外层 `try` 内。
一旦写库抛错，外层 `catch` 会把异常归类为可重试，并通过 `markFailed` 重新排期
（`:115-131`、`:161-180`）。电话已经拨出，下一轮 worker 会再次呼叫同一接收人，
默认最多 3 次（`oncall.repository.ts:71,161`）。

若 `markFired` 与兜底的 `markFailed` 都失败，异常还会逃出 `execute`，中断整批
（`oncall-worker.service.ts:77-79`）；该行保持 `running`，5 分钟后被
`reclaimStaleRunning` 重新排期（`oncall.repository.ts:98-131`）。

## 三位专家意见

### 安全与可靠性专家

- 影响为 P0：一次告警最多触发 3 次真实电话呼叫，且无法在用户侧撤销。
- 最小修复：把「已受理之后的持久化」移出通用重试路径；失败时写终态
  `markFailed(retryAt: null)`，兜底写入本身也必须被捕获，不能逃出 `execute`。
- `markFired` 是无条件按 id 更新，幂等，可安全重试一次（`oncall.repository.ts:185-204`）；
  `busy_timeout=5000`（`connection.ts:31`）已覆盖常见 `SQLITE_BUSY`，重试属于纵深防御。
- 不建议修改 `reclaimStaleRunning` 为终态：崩溃窗口会从「可能重复呼叫」变成
  「可能漏呼」，对值班而言更糟。
- 建议 Q-8（投递 `markSucceeded` 抛错导致重复发送）一并修复。

### 产品与运维专家

- 重复电话是 P0；重复聊天消息是 P2（可通过人工去重），两者严重度不同。
- 终态 `failed` 会把「已呼叫」显示成「呼叫失败」，可能诱导值班人员手动再呼一次；
  因此 `last_error` 必须显式写明「呼叫已发出、状态写入失败」。
- 修复局限在 `OncallExecution`，无 schema/配置/路由/鉴权变化，符合 Product charter，
  也恢复 ADR 0009「卡片重发也绝不重复打电话」的既有不变式。
- **Q-8 应单独处理**：投递成功还会触发自动加急（`delivery-execution.ts:116-130`），
  在那里直接落终态可能抑制呼叫，需要单独裁决「漏呼 vs 重复」。

### 独立评估者

- 方案可测：用真实内存库 + 窄 fake store，可确定性地覆盖「首次写失败、重试成功」、
  「两次写失败落终态」、「兜底也失败但不抛错」三种路径。
- 必须只把 `recordFired` 作用于 `result.ok` 分支；呼叫前的真实失败仍需保持可重试。
- 残留风险必须写清楚：两次写都失败或进程在写库前崩溃时，`reclaimStaleRunning`
  仍可能重呼；这是至少一次投递语义的固有限制，本次不引入新风险。
- 回滚：单提交 revert，无迁移、无数据清理。

## 最终选择

- 只修 `Q-30`；`Q-8` 拆分为独立事项，待单独裁决。
- `markFired` 失败后重试一次（幂等）；仍失败则：
  1. 用 `retryAt: null` 写终态 `failed`，错误文案明确「呼叫已发出，但状态写入失败」；
  2. 兜底写入失败只记录日志并返回 `failed`，绝不向调用方抛错；
  3. 绝不再排期重试。
- 不修改 `reclaimStaleRunning` 的语义，不新增 ping 状态或 schema。

## 理由

三位专家对「呼叫已发生则不得再排期重试、且不得抛错中断批次」一致。对 Q-8 是否同批
修复存在分歧，按最保守且可逆的原则选择单独处理：投递成功还承载自动加急语义，
同一改动会扩大爆炸半径。重试一次属于幂等写，成本低，可把瞬时写失败恢复为准确的
`fired` 状态。

## 回滚方式

回滚单个提交即可恢复旧行为；无迁移、无配置、无数据清理。已经写入 `failed` 的行
保持终态，不影响后续调度。

## 验收标准

- 服务商受理后 `markFired` 抛错：`execute` 返回 `failed`（不是 `retrying`），
  `urgency.ping` 只调用一次，`next_attempt_at` 为空，后续 `claimNext` 不再命中。
- 首次写失败、重试成功：返回 `fired`，`fired_at` 写入，`last_error` 为空。
- `markFired` 与兜底 `markFailed` 都失败：`execute` 正常 resolve（不 reject），
  批次继续处理后续 ping。
- 呼叫前的真实失败（服务商拒绝、配置错误）仍按原有退避/终态语义处理。
- `vp check`、控制台测试与构建通过。

## 残留风险

- 两次写库都失败，或进程在「呼叫已发出」与「写 `fired_at`」之间崩溃时，
  `reclaimStaleRunning` 仍会重新排期并可能重复呼叫。这是当前至少一次投递语义的
  固有限制；彻底解决需要 dispatch-intent 状态或服务商幂等键，均超出本轮范围。
- 终态行可能显示「失败」但实际已呼叫；错误文案与日志已显式说明，避免二次手动呼叫。
