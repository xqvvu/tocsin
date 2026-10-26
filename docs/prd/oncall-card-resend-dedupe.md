# 卡片重发不得重复加急呼叫

## 问题

加急电话的去重键是 `(fingerprint, destination_id, receiver)`，判定窗口为
5 分钟墙钟（`apps/console/src/server/oncall/oncall.service.ts:18`、
`apps/console/src/infra/sqlite/repositories/oncall/oncall.helpers.ts:74-89`）。
投递侧的 stale 重领也是 5 分钟（`apps/console/src/server/deliveries/delivery-worker.service.ts:42`）。

Q-232 之后，`reclaimStaleRunning` 重发同一 delivery 是常规路径。重发成功会
再次调用 `triggerPingsForDelivery`（`delivery-execution.ts:168-177`），而首条
ping 的 `created_at` 取自首次发送完成时刻，早于第二次发送完成时刻。只要第二次
发送更慢、或 worker 在 stale 截止后才恢复，`now - 5min` 就会晚于首条 ping 的
`created_at`，去重窗口失效，同一位值班人被重复呼叫。

这与已接受的 ADR 0009 直接冲突：`docs/adr/0009-oncall-feishu-urgent.md:61`
写明「卡片重发也绝不重复打电话」。当前实现只在窗口内成立。

`delivery_dedupe_keys` 是入站 idempotency key 去重，对同一 delivery 的重试无效
（`delivery.repository.ts:121-141`）。

## 用户故事

作为值班工程师，凌晨收到一次加急电话后，不希望因为投递 worker 重发了同一张
卡片，在几分钟内被同一个告警再叫醒一次。作为运维，我需要「同一条投递只呼叫
每个人一次」是可依赖的规则，而不是取决于两次发送耗时的运气。

## 范围

- 自动加急路径按 **delivery + receiver** 判重：同一 delivery 已经为某个
  receiver 建立过 ping（无论状态、无论 auto/manual），后续自动触发不再入队。
- 判定在 `enqueueForDelivery` 的同一事务内完成，通过新增的
  `dedupeByDelivery` 入参显式开启；只有自动路径开启。
- 手工 buzz 保持既有 5 分钟窗口语义：窗口内拒绝，窗口外允许显式重呼。
- 同 fingerprint 但不同 delivery 的新告警仍按窗口判重，风暴保护不变。
- `failed` 状态的 ping 同样抑制自动重呼：`oncall-execution.ts` 的
  `markDispatchedButUnrecorded` 会把「电话已拨出但状态未落库」记为 `failed`，
  数据库无法区分它与「确实没拨出」。重拨不可逆，因此宁可少呼；操作员仍可
  手工 buzz 补呼。

## 非目标

- 不修改 5 分钟去重窗口，不修改 stale 超时，不改 `oncall_ping_dedupe_keys`。
- 不新增表、列或迁移。
- 不改手工 buzz 的窗口语义，不改 UI。
- 不处理 ping 级 stale 重领可能重拨「已接通但未记录」的电话（backlog Q-235）。
- 不改投递重试策略。

## 验收标准

1. 同一 delivery 在 `t0` 与 `t0+6min` 各触发一次自动呼叫：每位 receiver 仍只有
   1 条 ping，`providerReference` 与 `created_at` 保持首次值。
2. 同一 delivery 的首条 ping 已终态 `failed` 后，`t0+6min` 的自动触发仍不新增
   ping（决策记录说明原因）。
3. 同一 fingerprint、不同 delivery 在 `t0+6min` 触发：新增各自 receiver 的
   ping，证明跨 delivery 的窗口语义未被收紧。
4. 手工 buzz：窗口内仍抛 `/already paged for this alert/`；窗口外对已自动
   呼叫过的 delivery 仍可创建 2 条 `manual` ping。
5. 现有 `oncall.service.test.ts`、`oncall-worker.service.test.ts`、
   `delivery-worker.service.test.ts` 全绿；`vp check` 0 error。

## 架构边界

- 业务规则（自动路径必须按 delivery 判重）留在 `OncallService`；持久化判定
  留在仓储的 `enqueueForDelivery` 事务内，与既有窗口去重同处。
- 不抛 `ORPCError`，无 schema 变更，无新依赖，无模块级单例。
- ADR 0009 补一条实现说明，明确该保证由 delivery 维度判定承担。

## 回滚

单提交 revert。无迁移、无数据回填、无配置变更；已存在的 ping 行继续有效，
回滚后自动路径恢复纯墙钟窗口语义。
