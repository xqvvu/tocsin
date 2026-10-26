# 投递成功但状态写入失败的处理

- 状态：已决并实施（2026-10-26，第 108 轮）
- 关联：backlog `Q-225`（= 早期记录的 `Q-8`）
- 决策方式：EXPERT_PANEL 三位专家独立评审（安全与可靠性 / 产品与运维 / 独立评估者）
- 相关先例：`docs/planning/decisions/oncall-fired-persistence-failure.md`（Q-30）

## 问题

`DeliveryExecution.execute` 把「发送」与「发送成功后的记账」放在同一个 `try` 里
（决策前 `apps/console/src/server/deliveries/delivery-execution.ts:105-117` 与 `:158-178`）。
目标已经接收告警后，`markSucceeded` 一旦抛错就会落进通用 `catch`，按 `unknown_error`
调用 `markFailed`，而 `nextRetryAt`（`:226-247`）默认 `retryable`，于是**同一条告警会被再次发送**。

同一条路径还会**跳过自动加急呼叫**（`triggerPings` 原本只在 `markSucceeded` 成功之后执行），
即「告警已送达、但值班电话没打出去」。

Q-30 的决策记录已明确把本项拆出单独裁决，理由是：投递成功后会触发自动加急，
若直接写终态可能抑制呼叫，需要在「漏呼」与「重复」之间单独取舍。

## 三位专家意见

### 安全与可靠性专家

- 风险排序：漏呼/迟呼（P0）> 重复呼叫（P0，受去重窗口保护）> 重复聊天消息（P2）。
- 发送用独立 `try`；成功后先 `triggerPings`，再 `markSucceeded`（失败重试一次）。
- `markSucceeded` 无条件按 id 更新、幂等（`delivery.repository.ts:380-414`），重试安全。
- 两次写都失败：落终态 `failed`，`retryHint: "not_retryable"`，错误文案必须写明
  「已送达，勿重发」；兜底写入自身也要捕获，不得逃出 `execute`。
- 先排呼叫后记账的关键理由：进程在「发送成功」与「记账」之间崩溃时，呼叫已经发出，
  不会出现「告警送达但没人被叫醒」。

### 产品与运维专家

- 重复电话是 P0，重复聊天消息是 P2；系统应优先保证呼叫发生。
- 终态 `failed` 会把「已送达」显示成失败，必须在 `last_error` 里写清楚，
  否则值班会手动重发。
- 反对新增 `delivered_unrecorded` 投递状态：`DeliveryStateSchema` 是核心枚举，
  扩张会波及筛选、徽标与 i18n，且旧版本解析会失败，不可逆。
- 主张「记账→呼叫」顺序，但前提同样是：呼叫不得依赖记账是否成功。

### 独立评估者

- 方案可在现有 fake store 模式下确定性覆盖（`delivery-execution.test.ts:468` 为纯推命令的
  fake，clock 与 backoff 均可注入，无定时器、零 flake）。
- 必须覆盖：写失败一次后成功、连续两次失败落终态、兜底写也失败但不外抛、
  发送失败仍可重试、配置错误不重试、pings 恰好一次。
- 仓储幂等已确认：`markSucceeded` 按 id 无条件更新，`attempt_count` 只由 `claimNext` 递增。

## 分歧与裁决

- 分歧点：`triggerPings` 与 `markSucceeded` 的先后。
  - 安全专家：先排呼叫（崩溃窗口内不丢呼叫）。
  - 产品专家：先记账，但呼叫与记账结果解耦。
- 按「有分歧 → 选最保守且可逆」的规则，采纳**安全专家**的顺序：
  先 `triggerPings`，再重试 `markSucceeded`。理由：两者都满足「呼叫不依赖记账」，
  但先排呼叫在崩溃窗口内严格更保守；重复呼叫由
  `oncall_pings` 的 (fingerprint, destination, receiver) 去重键兜住
  （`oncall.repository.ts:43-55`）。

## 最终选择

1. 发送（含配置解析）单独 `try`；目标受理后不再进入通用重试 `catch`。
2. 目标受理后：先 `triggerPings`（保留既有 try/catch，永不失败投递），
   再 `markSucceeded`，最多 2 次。
3. 两次都失败：以 `retryHint: "not_retryable"` 写终态 `failed`，
   文案写明「目标已接收告警、记录成功状态失败、不要重发」。
4. 兜底写入失败只记 `error` 日志，`execute` 返回 `failed`，绝不外抛、绝不中断整批。
5. 发送失败、`DomainValidationError` 与 pings 抛错路径的既有语义保持不变。

## 残留风险

两次写都失败、或进程在写库前崩溃时，行仍停在 `running`，
`reclaimStaleRunning`（`delivery-worker.service.ts:40`）会在 5 分钟后重排，仍可能重复发送。
这是「至少一次投递」语义的固有限制，本次不引入新风险，只是把重复窗口
从「任意一次写失败」收窄到「两次写 + 兜底写全部失败或崩溃」。
终态 `failed` 仍可人工重试（`delivery-retry-button.tsx`），唯一闸门是 `last_error` 的明确措辞。

## 回滚

单提交 revert，无迁移、无 schema、无配置、无依赖变化；已落终态的行保持 `failed`，
不影响调度语义。
