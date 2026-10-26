# 加急呼叫的领取归属

- 状态：已实现（2026-10-26，第 115 轮）
- 关联：`docs/adr/0009-oncall-feishu-urgent.md`；
  决策记录 `docs/planning/decisions/oncall-claim-ownership.md`；
  上游切片 `docs/prd/oncall-dispatch-intent.md`（Q-235）

## 问题

`OncallWorker.runOnce` 一次领取整批 ping（默认 10、上限 100）后串行拨号，
`claimNext` 在领取时就把整批置为 `running`（`oncall.repository.ts:180-233`）。
批次里尚未轮到的 ping 仍带着领取时刻的 `updated_at`；一旦批次耗时超过 5 分钟
stale 窗口，另一轮 reclaim 会把它当作「从未拨出」重新排期
（`oncall.repository.ts:132-178`）。

并发的第二个 worker 来自手工 buzz：`container.createOncallService` 的
`dispatchNow` 每次新建 `OncallWorker` 直接 `runOnce`
（`container.ts:343-355`），绕过周期 runner 的 single-flight
（`runtime/delivery-worker-runner.ts:65-105`）。当手工页与慢批次重叠时，
被收回的 ping 会被第二个 worker 重新领取并拨出，而原 worker 到达该 ping 时
仍会写拨号标记并拨号（`oncall-execution.ts:91-115`）——同一接收人被拨两次。

另外，拨号标记写入的是 `runOnce` 开头的批次时刻，而不是真正拨号的时刻
（`oncall-worker.service.ts:51-52`、`oncall-execution.ts:92`）。标记因此不能
把 stale 窗口锚在拨号开始，慢批次里的 ping 即使已经在通话，也可能被下一轮
reclaim 判成 stale。Q-235 的决策记录声称「锚在拨号开始」，与实现不符。

## 用户故事

1. 作为值班工程师，同一告警的同一接收人**至多被自动呼叫一次**；即使批量派发
   很慢、操作员同时手动补呼，也不会因为状态竞争再次响铃。
2. 作为操作员，点「发起呼叫」后请求立即返回，不需要等待当前批次拨完；实际拨号
   可能落在下一轮 tick，但记录始终在队列里可见。
3. 作为排障者，当一次尝试失去归属时，日志明确说明它被回收、没有拨号，而不是
   静默失败或重复拨号。

## 范围

- `markDispatchStarted` 增加 `expectedAttemptCount` 归属校验：`attempt_count`
  在每次 `claimNext` 时递增，天然是 fencing token。更新 0 行时返回 `null`。
- 执行器在拨号前先写标记；写不进去（被回收/被重新领取）就不拨号，返回新的
  `superseded` 结果，不修改行、不计数。写库异常仍照常拨号（Q-225 的
  「呼叫不得依赖记账」）。
- 标记的 `startedAt` 改用执行器自己的时钟，锚定拨号时刻而不是批次领取时刻。
- 手工 buzz 复用同一个 on-call runner 的 `runNow()`，共享 single-flight；
  runner 忙时本次请求直接返回，ping 留给下一轮 tick。

## 非目标

- 不改变 reclaim 的 stale 阈值、退避序列、`max_attempts` 或去重窗口语义。
- 不引入跨进程锁、多副本协调、新服务或新依赖。
- 不把 `dispatch_started_at` 暴露到 core DTO 或 UI（延续 Q-235 的裁决）。
- 不改 delivery worker 的批量领取行为（重复聊天消息有平台侧幂等与可感知代价，
  与重复电话不同）。
- 不修 Q-237（buzz 不校验目标启用状态）；已在 backlog 单独跟踪。

## 验收标准

1. 已失去归属的尝试调用 `execute` 不产生任何 provider 调用，返回 `superseded`，
   且不覆盖新 attempt 的 `state` / `updated_at`。
2. 两个 worker 交错：慢批次中被收回并重新领取的 ping，只由新 worker 拨一次；
   原 worker 到达它时跳过。每个接收人恰好一次呼叫。
3. 拨号瞬间读取到的 `updated_at` 等于本次呼叫开始时刻，而不是批次领取时刻。
4. 既有语义不变：`markDispatchStarted` 写失败仍照常拨号；`dispatch_started_at`
   非空的 stale 行仍落终态、不自动重拨；未拨出的 stale 行仍按重试预算回到队列。
5. 手工 buzz 不再创建第二个 worker，复用 on-call runner；runner 忙时请求立即返回。
6. `vp check`、`vp run -r test`、`vp run -r build` 全绿。

## 架构边界

- 改动只落在 console 的 worker / repository / execution / container 装配，
  不触碰 `packages/core`、`packages/destinations` 的公开形状。
- 归属判定留在 SQLite 的原子 `UPDATE ... WHERE state = 'running' AND
  attempt_count = ?` 内，不引入进程内锁。
- 新增 outcome 只在 worker 内部计数；health、日志结构与既有 DTO 不变。
