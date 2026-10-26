# 投递结果未知时的证据与文案

## 问题

投递目标已经受理告警、但 `markSucceeded` 连续两次失败时，兜底
`markFailed` 会写入「目标已受理、不要重发」的哨兵文案（Q-231）。
如果这次兜底写入**也失败**，投递与 attempt 会停在 `running`；
5 分钟后 `reclaimStaleRunning` 把它当作普通超时处理：

- 尝试次数未耗尽：自动置回 `pending` 并重发（至少一次语义，可能重复）；
- 尝试次数已耗尽：落终态 `failed`，但 `last_error` 写的是
  「Delivery attempt timed out before completion」。

第二行是真正的运维误导：文案断言「超时未完成」，而事实是
**worker 在尝试中途消失，目标可能已经收到告警**。值班看到「超时」
会认为没有发出，进而手动重试，造成重复呼叫。

同时，backlog 里「reclaim 覆盖哨兵」的说法并不成立：哨兵写入成功时
投递已是 `failed`，reclaim 只选 `running`，永远选不中；兜底失败时
没有任何哨兵落库。真正的缺陷是**证据与语义都没落到行上**，而不是
已有文案被覆盖。

## 用户故事

作为值班工程师，我在投递列表看到一条 `failed` 投递，`last_error` 说
「attempt 未完成、结果未知、目标可能已收到」。我需要知道系统会怎么做
（自动重发 / 已停止重发），再决定要不要人工重试，而不是被一句
「超时」误导为「肯定没发出去」。

## 范围

- `@tocsin/core` 新增两个环境中立常量：
  - `DELIVERY_OUTCOME_UNKNOWN_RETRY_ERROR`：还有重试预算，系统将自动重发；
  - `DELIVERY_OUTCOME_UNKNOWN_FINAL_ERROR`：重试预算耗尽，自动重发停止，
    提示运维先核实目标再手动重试。
- 仓储 `reclaimStaleRunning` 按「是否还有重试预算」选择文案；保留
  `input.error` 作为显式覆盖入口。
- `DeliveryExecution.recordSuccess` 的兜底 `markFailed` 改为最多写 2 次，
  与 `recordSucceeded` 的两次写一致：这次写是「目标已受理」的唯一本地证据，
  多一次机会能显著缩短证据丢失的窗口。
- 两个新文案都不匹配 `isDeliveryAcceptedUnrecorded`：结果未知不等于已送达，
  人工重试必须保持可用。

## 非目标

- 不新增投递状态、不改 `DeliveryStateSchema`、不做迁移；第 108 轮已否决
  扩张状态枚举。
- 不改 reclaim 的自动重试策略：仍保持 at-least-once，崩溃后自动重发。
- 不新增 UI 徽标或重试确认框。列表 `last_error` 列与详情摘要已能显示新文案；
  「结果未知」专用提示属于独立 UI 切片。
- 不动手动 `runDeliveryWorker` 的 runner 单飞问题（Q-227），另开切片。
- 不调整 ping 去重窗口（5 分钟）与 stale 超时（5 分钟）的边界；重复呼叫的
  残余风险见下。

## 验收标准

1. 兜底 `markFailed` 首次抛错、第二次成功时：`execute` 返回 `failed`，
   `markFailed` 恰被调用 2 次，最终写入 `DELIVERY_ACCEPTED_UNRECORDED_ERROR`，
   `retryAt = null`，并保留 `responseStatus` / `responseBody`。
2. 兜底两次都抛错时：仍返回 `failed`，不外抛，`markFailed` 恰被调用 2 次，
   批次继续处理后续投递。
3. reclaim 未耗尽尝试次数时写 `DELIVERY_OUTCOME_UNKNOWN_RETRY_ERROR`
   并置 `pending`/`retryAt = now`；耗尽时写
   `DELIVERY_OUTCOME_UNKNOWN_FINAL_ERROR` 并落终态 `failed`。
4. 两个新常量经 `redactText` 后与原值严格相等，且
   `isDeliveryAcceptedUnrecorded` 对两者都返回 `false`。
5. 携带「结果未知」终态文案的投递仍可通过 `retryNow` 重新排队。
6. 现有 Q-231 哨兵拒绝、投递计数与 worker 健康快照行为不变。

## 架构边界

- 常量放在 `packages/core/src/delivery/delivery.ts`，环境中立，服务端、
  仓储与未来的 UI 判定共用同一字面量。
- 判定与写入仍在仓储层完成，不新增服务层分支，不抛 `ORPCError`。
- 无 schema 变更、无迁移、无新依赖。

## 回滚

单提交 revert。已写入的新文案保留为历史证据；它们不匹配哨兵，
回滚后这些行仍可人工重试。回滚不改变队列行为，也不需要数据修复。
