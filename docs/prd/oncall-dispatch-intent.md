# 加急呼叫的拨号意图证据

## 问题

加急 ping 的状态机是 `scheduled → running → fired|failed`（`docs/adr/0009-oncall-feishu-urgent.md`
决定 5）。`claimNext` 在事务里把 ping 置为 `running` 并 `attempt_count+1`
（`apps/console/src/infra/sqlite/repositories/oncall/oncall.repository.ts:151-207`），
**然后**执行器才把呼叫交给 provider（`apps/console/src/server/oncall/oncall-execution.ts:86-120`）。

因此 `state = 'running'` 只证明「某次 attempt 已被领取」，不证明这次呼叫有没有真的
拨出去。两个真实的到达路径会留下这种无证据的 `running` 行：

1. **进程在拨号前后被杀**（部署、OOM、容器重启）。`claim` 已提交，`markFired`
   从未执行。这是最常见的一条，且不需要任何写库失败。
2. `markFired` 连续两次失败、兜底 `markFailed` 也失败（磁盘满、只读重挂、I/O error）。
   `markDispatchedButUnrecorded` 只记日志不外抛（`oncall-execution.ts:178-217`），
   行停在 `running`。

`reclaimStaleRunning` 对这样的行调用
`markFailed({ retryAt: attemptCount < maxAttempts ? now : null })`
（`oncall.repository.ts:116-149`）。`markFailed` 内部重算后把行置回 `scheduled`
（`:224-244`），而 `OncallWorker.runOnce` 的顺序是 reclaim → claim
（`apps/console/src/server/oncall/oncall-worker.service.ts:54-105`），所以还有重试
预算的 ping 会在**同一次循环里立刻被重新领取并再次拨号**。

第 24 轮（Q-30）已经裁定：不能把 `reclaimStaleRunning` 一律改成终态，因为那会把
「崩溃于拨号前」系统性变成漏呼，比重复呼叫更糟
（`docs/planning/decisions/oncall-fired-persistence-failure.md:28-29`）。同一份决策
记录把「dispatch-intent 状态」列为彻底解法（`:84-86`），本切片落地它。

## 用户故事

作为值班工程师，被加急电话叫醒后，不希望几分钟内因为一次 worker 重启或一次写库
失败再被同一个告警叫一次——电话文案固定为「给你发了一条加急消息」，我无法从声音
判断它是不是同一件事。

作为运维，我需要「这次到底拨没拨出去」是可判定的：如果确定没拨出，系统应自动补呼；
如果可能已经拨出，系统不许再自动拨，但必须在投递详情里明确告诉我「可能已拨出」，
让我决定是否手工补呼。

## 范围

- 新增 nullable 列 `oncall_pings.dispatch_started_at`（forward-only 加法迁移 `0004`）。
- 执行器在把呼叫交给 provider **之前**写这条标记；写入是 **best-effort**：
  写失败只记 warn，呼叫照发。呼叫绝不允许依赖记账是否成功
  （`docs/planning/decisions/delivery-success-persistence-failure.md:40,55-59`）。
- `claimNext` 每次领取都把标记重置为 `NULL`，避免上一次 attempt 的标记伪装成本次的证据。
- `reclaimStaleRunning` 按标记分流：
  - `NULL`（确定没到 provider）→ 维持既有语义，还有预算就重新排期（同 tick 重拨是优点）。
  - 非 `NULL`（可能已拨出）→ 终态 `failed`、`retryAt: null`，文案写明
    「可能已拨出、未自动重试」。
- 标记写入同时刷新 `updated_at`，把 stale 窗口锚在「拨号开始」而不是「批量领取」，
  避免一次慢批次把自己的 ping 判成 stale。
- 列不进入 core `OncallPing` / oRPC DTO，UI 不改；运维可见面仍是 `failed` + `last_error`。

## 非目标

- 不新增 ping 状态（`state` 枚举与 CHECK 约束不变），不改 ADR 0009 的状态机。
- 不改 5 分钟 stale 超时、不改退避、不改去重窗口、不改手工 buzz 语义。
- 不解决「批量领取后串行执行可能超过 stale 超时」这一独立并发问题
  （见 backlog Q-236）。
- 不引入 provider 侧幂等键，不拆分 urgency adapter 的 token 获取与拨号调用。
- 不给投递列表新增「呼叫结果未知」徽标，不给 buzz 增加 `destination.enabled` 前置校验
  （分别记为 backlog UI-68、Q-237）。

## 验收标准

1. 正常路径：`markDispatchStarted` 在 `urgency.ping` **之前**被调用（顺序断言）。
2. 记账失败不影响呼叫：`markDispatchStarted` 抛错时仍然调用 `urgency.ping`，结果仍为 `fired`。
3. 可能已拨出的 stale 行：`reclaimed=1`、`claimed=0`、provider 调用 0 次、
   `state=failed`、`nextAttemptAt=null`、`lastError` 含「may have been placed」，
   后续 `claimNext` 返回空。
4. 确定没拨出的 stale 行：同一次 `runOnce` 内完成 reclaim + 重领 + 重拨，
   provider 调用恰好 1 次，`state=fired`、`attemptCount=2`。
5. 迁移：fresh 库与 0003 修复路径都存在该列；列 nullable、无默认值，
   存量行保持 `NULL`（不 backfill）。
6. 既有语义回归：`markFired` 写失败、终态失败、not_retryable、退避重试行为不变。

## 架构边界

- 迁移遵循 forward-only：`0004` 通过 `ensureColumn` 幂等加法，不改 `0001` 语义；
  fresh 库由 baseline builder 建列，`0004` 在已安装库上补列。
- 标记只存在于 SQLite 仓储层（`oncall.interface.ts` 的行类型 + `oncall.repository.ts`），
  不进 `@tocsin/core` 的 DTO，不扩大浏览器的数据面。
- 执行器只通过 `OncallExecutionStore` 的窄 `Pick` 增加一个方法，不直接摸 SQLite。
- 不新增可部署服务、不新增运行时依赖、不改投递/路由/auth 语义。

## 回滚

代码回滚即可，列保留：nullable 列对旧代码惰性，旧代码只 claim `scheduled`，
已落 `failed` 的行不会回溯重拨。**不要**从 `migrate/plan.ts` 删除 `0004`——
一旦某个库记录了该版本，删掉计划会触发 `assertNoUnknownAppliedMigrations`
（`apps/console/src/infra/sqlite/migrate/runner.ts:177-190`）导致启动失败。
