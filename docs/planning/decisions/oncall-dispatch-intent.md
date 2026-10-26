# 加急呼叫的拨号意图证据

- 状态：已决（2026-10-26，第 114 轮）
- 关联：backlog `Q-235`；上游决策 `docs/planning/decisions/oncall-fired-persistence-failure.md`（Q-30）
- 决策方式：EXPERT_PANEL 三位专家独立评审（安全与可靠性 / 产品与运维 / 独立评估者）

## 问题

`state = 'running'` 的 ping 无法证明这次 attempt 有没有真的拨出去。进程在拨号前后被杀
（部署 / OOM / 重启）就会留下这种行，不需要任何写库失败。
`reclaimStaleRunning` 目前对它有重试预算就置回 `scheduled`
（`apps/console/src/infra/sqlite/repositories/oncall/oncall.repository.ts:116-149`），
而 `OncallWorker.runOnce` 先 reclaim 再 claim（`apps/console/src/server/oncall/oncall-worker.service.ts:54-105`），
所以会在同一次循环里立刻重拨同一接收人。

同一路径还有一个更宽的到达面：`claimNext` 一次性把整批（默认 10、上限更高）置为
`running`，执行是串行的；慢批次或手动 buzz 新建的 worker（`container.ts:343-353`
绕过 runner 的 single-flight）可以让仍在执行的 ping 被另一轮 reclaim 抢走并重拨。

## 三位专家意见

### 安全与可靠性专家

- 主张修正前提：根因不是「同一 tick」，而是「reclaim 无法证明这次 attempt 没拨出」。
  单纯推迟 `next_attempt_at` 只是延后重复电话。
- 失效模式排序：漏呼 > 重复呼叫 > 状态不可见。漏呼是静默失败；重复呼叫可感知。
- 可达性：单进程 `better-sqlite3`（`infra/sqlite/connection.ts:17-31`）吸收了常见
  `SQLITE_BUSY`，三次写全失败需要磁盘满/只读挂载这类持久故障；但「claim 后进程被杀」
  是主路径，且窗口包含 token 拉取与两次 HTTP。
- 推荐 **C（拨号前写意图标记）**，B（reclaim 一律终态）为零迁移兜底；反对 A（现状）。
  要求 `claimNext` 每次领取重置标记，否则上一次 attempt 的标记会污染下一次。
- 认为 C 的加法迁移不越界：nullable 列 + forward-only，无新服务、无用户代码执行。

### 产品与运维专家

- 现有 UI 没有任何字段能区分「确定没拨 / 可能拨了 / 已拨出」，四种方案都只能靠
  `last_error` 承载证据；因此文案必须写「可能」，不能断言「已拨出」或「没拨出」。
- B 不可接受：它把漏呼完全交给人工，而补呼入口很深（只在投递详情「加急」Tab）、
  `buzzDelivery` 不检查 `destination.enabled` 会假成功、且会按全部接收人重呼。
- A 与第 113 轮 Q-234 自相矛盾：同一 delivery+receiver 不再建新 ping，却让旧 ping 自己重拨。
- 推荐 **C**，但**修正一个细节**：标记写入失败时**必须照常拨号**。让呼叫依赖记账
  违背 Q-225 的裁决（`delivery-success-persistence-failure.md:40,55-59`），应退化为 A 的行为。

### 独立评估者

- 逐条复核：reclaim → claim 同 tick 成立（reclaim 不增加 `attempt_count`，
  `claimNext` 的 `attempt_count < max_attempts` 只在耗尽时挡住）；「同一分钟」不成立，
  实际间隔 ≥ 5 分钟；更短路径是「provider 受理后、`markFired` 提交前崩溃」。
- 现有测试缺口：reclaim 唯一的用例用 `runOnce({limit: 0})` 故意阻止同 tick claim，
  恰好掩盖了缺陷；`repositories/oncall/` 没有任何测试文件。
- 给 B 与 C 都写出了可执行验收标准；C 的迁移只需新增一个步骤 + `schema.ts` 建表列 +
  `oncall.interface.ts` / `oncall.repository.ts` / `oncall-execution.ts`，
  不必改 `ensure-complete-schema.ts`；暴露 `dispatch_started_at` 会污染 DTO，不应做。
- 推荐 **C**，并指出 Q-30 已明确否决 B、把 dispatch-intent 列为正解；
  本仓库对 delivery 拒绝 C 是因为重复聊天消息只有 P2，而重复电话是 P0。

## 分歧与裁决

- 三位专家一致选择 **C**。
- 唯一分歧：标记写入失败时「不拨号」（安全专家、评估者）还是「照拨」（产品专家）。
  - 按「有分歧 → 选最保守且可逆」：两条路的不可逆后果分别是「漏呼」与「重复呼叫」，
    而安全专家自己的排序把漏呼列为最坏；Q-225 的既有裁决也明确「呼叫不得依赖记账」。
  - 采纳**产品专家**的方案：best-effort 写标记，写失败退化为 A 的行为并记 warn 日志。

## 最终选择

1. 新增 nullable 列 `oncall_pings.dispatch_started_at`，forward-only 迁移 `0004`，
   通过 `ensureColumn` 幂等加法（fresh 库由 baseline builder 建列）。
2. `claimNext` 每次领取把标记重置为 `NULL`。
3. 执行器在 `urgency.ping` 之前 best-effort 写标记，写失败只记 warn，照常拨号；
   写入同时刷新 `updated_at`，把 stale 窗口锚在拨号开始。
4. `reclaimStaleRunning` 按标记分流：`NULL` → 维持既有重试语义；
   非 `NULL` → 终态 `failed` + `retryAt: null` + 「可能已拨出」文案。
5. 列不进入 core DTO、不进 UI；运维可见面仍是 `failed` + `last_error`。

## 理由

marker 是唯一同时守住「不重复拨已拨出的」与「不丢没拨出的」的方案。
它把不可逆边界（呼叫发出）落成一个可判定的证据，而不是用一律保守去换取一种失败
替代另一种失败。加法迁移是本仓库最低风险的 schema 变更形态，且可随代码回滚。

## 回滚方式

只回滚代码，保留 `0004` 在计划里。nullable 列对旧代码惰性；旧代码只 claim `scheduled`，
已落 `failed` 的行不会回溯重拨。删除 `0004` 会让已记录该版本的库启动失败
（`runner.ts:177-190`）。

## 验收标准

见 `docs/prd/oncall-dispatch-intent.md`「验收标准」六条，均由
`oncall-execution.test.ts`、`oncall-worker.service.test.ts`、`migrate.test.ts` 确定性断言。

## 残留风险

- 标记写入成功、但进程在真正发出 HTTP 请求之前被杀：不会拨号却不再自动重试
  （窗口是 token 获取 + fetch 建立，秒级）。彻底消除需要把 urgency adapter 的
  token 获取与拨号拆开，超出本轮范围。
- 标记写入失败的那次 attempt 退化为 A 的行为：若随后所有写库都失败且进程存活，
  reclaim 仍可能重拨一次。这是「呼叫不依赖记账」的必然代价，已记录在 PRD 非目标。
- 批量领取后串行执行可能超过 5 分钟 stale 超时的独立并发问题**未修**，
  记为 backlog Q-236（`claimNext` 一次性领取整批 + `dispatchNow` 绕过 single-flight）。
