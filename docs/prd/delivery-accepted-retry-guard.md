# 已送达未记账的投递禁止手动重试

## 问题

投递目标已经受理告警，但 Tocsin 连续两次写入成功状态失败时，
`DeliveryExecution.recordSuccess` 会把投递落为终态 `failed`，
并在 `last_error` 写入「目标已受理、记录失败、不要重发」。
这条文案此前只是给运维看的提示：`retryNow` 只校验 `state = failed`，
运维在列表或详情点「重试投递」仍会把同一条告警再发一次。
对电话、短信这类目标，这等于重复 on-call 呼叫。

## 用户故事

作为值班工程师，我在投递列表里看到一条 `failed` 投递，
它的 `last_error` 说明目标其实已经收到告警。我需要系统明确阻止我重发，
而不是依赖我读完英文文案后自己克制。

## 范围

- `@tocsin/core` 暴露唯一常量 `DELIVERY_ACCEPTED_UNRECORDED_ERROR` 与谓词
  `isDeliveryAcceptedUnrecorded`，写入端、仓储与 UI 共用同一判定。
- `DeliveryExecution` 的兜底 `markFailed` 改用该常量写入 `last_error`。
- 仓储 `retryNow` 在同一事务内、UPDATE 之前识别该终态，抛出
  `DeliveryAlreadyAcceptedError`；`server/orpc/errors.ts` 映射为 `CONFLICT`。
- 详情页重试按钮在该终态下不渲染动作，改为显示「目标已受理，禁止重试」。
- 列表行内重试图标在该终态下隐藏；`last_error` 列仍保留完整原因。

## 非目标

- 不新增投递状态、不改 `deliveries` 表结构、不做迁移。`retryHint` 没有落库，
  新增列仍需按同一文案回填存量行，收益不足以抵消迁移成本。
- 不提供「目标其实没收到，强制重发」的逃生通道；这需要显式的确认流程与审计，
  另开切片。
- 不处理「兜底 `markFailed` 也失败、投递停在 `running` 后被
  `reclaimStaleRunning` 重领」的固有限制，这是至少一次投递语义的残余风险，
  已在决策文档登记。

## 验收标准

1. `redactText(DELIVERY_ACCEPTED_UNRECORDED_ERROR)` 与原值严格相等
   （写路径与读路径都会过脱敏）。
2. 哨兵终态的投递调用 `retryNow` 抛 `DeliveryAlreadyAcceptedError`，
   且行内容（state、attempt_count、max_attempts、last_error、updated_at）
   完全不变。
3. 普通失败（例如 `destination unavailable`）仍可重试，行为与既有测试一致。
4. oRPC `operations/retryDelivery` 对该终态返回 `CONFLICT`（409），消息保留。
5. 详情页与事件详情投递表不渲染重试动作；列表行不渲染重试图标。
6. 中英文文案齐全，`vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- 判定常量与谓词放在 `packages/core/src/delivery/`，环境中立，可被 console
  服务端、仓储与 UI 同时引用。
- 拒绝点是仓储 `retryNow`（唯一的 `failed → pending` 写入口），不是 UI，
  也不是只放在服务层，避免其他调用方绕过。
- 仓储抛领域错误，oRPC 边界统一翻译；不在仓储抛 `ORPCError`，
  不改动 `operations.service` 的透传。

## 回滚

单提交 revert，无迁移、无数据改写。回滚后这些行恢复为可手动重试；
存量 `last_error` 文本保持不变，可作为事后核查证据。
