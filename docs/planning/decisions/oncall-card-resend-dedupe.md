# 卡片重发去重：delivery 维度判定与 failed 语义

- 状态：已决并实施（2026-10-26，第 113 轮）
- 关联：backlog `Q-234`（第 112 轮 Q-232 EXPERT_PANEL 提出）
- 决策方式：EXPERT_PANEL 三位专家独立评审（安全与可靠性 / 产品与运维 / 独立评估者）
- 相关先例：
  - `docs/adr/0009-oncall-feishu-urgent.md`（决定 6：去重风暴保护）
  - `docs/planning/decisions/delivery-outcome-unknown.md`（Q-232）

## 问题复述

stale 重领会重发同一 delivery；重发成功再次触发自动加急。去重键按
`(fingerprint, destination_id, receiver)` + 5 分钟墙钟判定
（`oncall.helpers.ts:74-89`），而 stale 超时同为 5 分钟
（`delivery-worker.service.ts:42`）。首条 ping 的 `created_at` 是首次发送完成
时刻，第二次发送完成时刻只要更晚，`now - 5min` 就晚于首条 `created_at`，
窗口失效。Q-232 把 stale 重发改成常规路径后，这不是罕见竞态。

ADR 0009:61 已写明「卡片重发也绝不重复打电话」，所以本轮是让实现回到已接受
的契约，而不是新增产品语义。

## 三位专家意见

### 安全与可靠性专家

- 推荐 A：只改自动路径；若同一 delivery + receiver 已有 **非 failed** ping
  则抑制，`failed` 放行，让「首次在入 ping 前崩溃」由重试补发。
- 理由：ping 行是「已呼过」的持久证据，不依赖墙钟；`delivery_id` 已有索引
  （`migrate/schema.ts:285-286`），无迁移。
- 可逆性：只改服务读取与日志，revert 单提交即回滚。
- 最坏情况：漏呼代价大于重复呼叫；A 的「永不呼叫」仅限单个 delivery，
  且有 failed 放行与手工 buzz 兜底，风险有界；延长窗口（B）会压住同
  fingerprint 的真实复燃，漏呼面更大。

### 产品与运维专家

- 推荐 A′（与安全专家一致）：自动 ping 按 delivery + receiver 判重，仅当既有
  ping 为 `scheduled/running/fired` 时抑制；终态 `failed` 允许重排。
- 手工 buzz 维持窗口语义：确认仍紧急时走显式、可审计的重呼，每窗口最多一次。
- 延长窗口只降低概率、不封死 race，还会把手工重呼锁定期翻倍，故不采用。
- 运维视角：同一条投递的传输重试不是新告警，不应再叫醒同一个人。

### 独立评估者

- 问题在真实崩溃路径下基本必现，而非仅边界抖动：t0 认领，t0+s1 发送成功并
  入 ping，进程在 `markSucceeded` 前死亡；重启后首个 tick 在 `t0+T+δ` 重领并
  同轮重发，第二次 ping 时刻为 `t0+T+δ+s2`，抑制条件为 `W−T ≥ δ+s2−s1`；
  默认 `W=T=5min`，δ 通常为正，故会重呼。
- 推荐 A（含 failed 抑制）：`failed` 是歧义状态——`oncall-execution.ts:181-186`
  的 `markDispatchedButUnrecorded` 会把「电话已拨出但状态未落库」记为
  `failed`。若排除 failed，恰好会在「已呼未记」时重复拨号。重拨不可逆，
  应按「存在即抑制」；代价是三次呼叫都失败后自动不再补呼，但手工 buzz 仍在。
- 另指出 ping 级 stale 重领可能在「已接通、markFired 前进程死亡」时重拨，
  本轮方案不覆盖，应独立跟进。

## 分歧与裁决

- 分歧：终态 `failed` 的 ping 是否应阻止后续自动呼叫。
  - 安全与产品：应放行，因为「漏呼」比「重复呼叫」更糟。
  - 评估者：应抑制，因为 `failed` 可能是「已拨出但未记录」，重拨不可逆。
- 裁决：按「有分歧选最保守且可逆」执行**评估者方案**。理由：
  1. `failed` 的证据是歧义的，数据库没有「是否真的拨出」字段；
  2. 重复电话是对外、不可撤销的副作用，且接收人无法分辨；
  3. 自动不补呼的漏呼是**可见且可恢复**的：ping 行与 `last_error` 在投递详情
     可见，操作员可手工 buzz；而重复呼叫没有可见信号；
  4. ADR 0009:61 的「绝不重复」是绝对表述，实现应优先守住。
- 手工 buzz 不受 delivery 判定影响，保留操作员的最终决定权。

## 最终选择

1. `EnqueueOncallPingInput` 新增 `dedupeByDelivery`。
2. `enqueueForDelivery` 在同一事务内查询 `oncall_pings`（`delivery_id` +
   `receiver`），命中即返回 `null`；不按状态、不按 trigger 过滤。
3. `OncallService.triggerPingsForDelivery` 开启该判定；`buzzDelivery` 不开启。
4. 无迁移、无窗口调整、无 UI 改动。
5. ADR 0009 决定 6 补实现说明。

## 残余风险

- 三次呼叫均真实失败、且投递随后被重发的场景，自动路径不再补呼；操作员需要
  从投递详情的 ping 记录发现并手工 buzz。
- ping 级 stale 重领仍可能重拨「已接通但未记录」的电话（backlog Q-235）。
- 跨 delivery 的 5 分钟风暴窗口语义未变：同一 fingerprint 的新 delivery 在
  窗口外仍会再次呼叫，这是有意的风暴保护边界。

## 回滚

单提交 revert；无迁移、无数据改写、无配置变更。回滚后自动路径恢复纯窗口
语义，已有 ping 行不需要清理。
