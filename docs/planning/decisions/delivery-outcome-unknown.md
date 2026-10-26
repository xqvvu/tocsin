# 投递结果未知：reclaim 策略与兜底证据

- 状态：已决并实施（2026-10-26，第 112 轮）
- 关联：backlog `Q-232`（第 110 轮 security lane 提出，第 111 轮 quality lane 升级）
- 决策方式：EXPERT_PANEL 三位专家独立评审（安全与可靠性 / 产品与运维 / 独立评估者）
- 相关先例：
  - `docs/planning/decisions/delivery-success-persistence-failure.md`（Q-225）
  - `docs/prd/delivery-accepted-retry-guard.md`（Q-231）
  - `docs/planning/decisions/oncall-fired-persistence-failure.md`（Q-30）

## 问题复述与事实纠偏

投递目标已受理、`markSucceeded` 两次失败、兜底 `markFailed` 也失败时，
投递停在 `running`；`reclaimStaleRunning` 5 分钟后按普通超时处理，
未耗尽则自动重发，耗尽则落 `failed` + 「attempt timed out」文案。

三位专家独立复核后一致确认：**backlog 中「reclaim 覆盖哨兵」的说法不成立**。

- 哨兵写入成功时投递已是 `failed`，reclaim 只选 `state = running` 的行，
  不会触碰（`delivery.repository.ts:202-203`）。
- 兜底失败时 `markFailed` 事务整体回滚，没有哨兵可被覆盖；行仍停在
  claim 事务写入的 `running`，所以 reclaim 会选中它。
- 因此「reclaim 读取哨兵/retryHint 并跳过重排」对真正危险路径是 no-op；
  真正的缺陷是「目标已受理」的证据从未落库。

## 三位专家意见

### 安全与可靠性专家

- 失效模式排序：漏呼 > 重复呼叫 > 重复消息。方案 B（stale 一律终态、
  不自动重试）会把「worker 崩溃」系统性转成漏呼，方向相反。
- 推荐 A（无迁移）：兜底写入重试 2 次；reclaim 文案明确「worker 中断、
  目标可能已收到、本次为自动重发」；保留 at-least-once。
- `markFailed` 单事务按 id 更新，重试幂等；爆炸半径是一个常量加一个重试循环。
- 纠偏：ping 去重窗口 5 分钟与 stale 超时 5 分钟恰好相等，重发后的 ping
  是否仍被去重取决于运行间隔与发送耗时，属边界抖动，不能当作已解决。
- 手动 `runDeliveryWorker` 绕过单飞不并入：`claimNext` 已有 `state=pending`
  条件更新与 `numUpdatedRows` 检查，DB 层挡住双领；并入会扩大回滚面。

### 产品与运维专家

- 凌晨 3 点的视角：A 让系统继续自动投递，值班只在最终 `failed` 时读到
  「结果未知、可能已收到」；B 把每次升级/崩溃留下的 `running` 行变成人工
  核实队列，而运维无从分辨，只能去翻目标系统或直接重试——把重复决策推给
  最疲惫的人，且若那条根本没发出就变成漏呼。
- 重复聊天消息是 P2；重复电话是 P0，但 A 的自动重发由系统统一执行，
  且终态文案把「可能已收到」摆在操作员面前。
- 文案应分两版：仍有重试预算 → 「系统将自动重发」；预算耗尽 →
  「自动重发已停止，请先核实目标再决定是否重试」。不复用哨兵常量。
- 不新增 UI：列表 `last_error` 列与详情摘要已能显示；「结果未知」徽标与
  重试确认框拆独立 UI 切片。

### 独立评估者

- 复核确认「覆盖说」不成立；并指出「兜底失败=什么都没落库」的表述需要
  精确化：兜底事务只回滚自身写入，行仍是 claim 后的 `running`，reclaim
  确实会选中——危险路径真实存在。
- 推荐 A-lite + 测试：兜底重试与文案调整；文案必须写「结果未知」，
  不要断言「已送达」。
- 方案 B 会推翻 `delivery-worker.service.test.ts` 的既有恢复语义（reclaim
  后第二次发送成功），导致告警丢失；方案 C 无法消除歧义，且需要热路径
  多一次写与迁移，回滚最贵；D 不解决文案误导。
- 必须新增/更新的测试：兜底首抛后成功、兜底两次都抛、reclaim 两种文案、
  仓储 `retryNow` 对「结果未知」仍放行、哨兵常量经脱敏不变。
- 不可确定性验收标准（「降低重复概率」）必须改写为状态/调用次数/文案断言。

## 分歧与裁决

- 分歧：文案是否断言「目标可能已收到」。
  - 产品与安全：需要这句，才能让值班意识到重复风险。
  - 评估者：崩溃可能发生在发送前，不应断言。
- 裁决：采用「may or may not have received」的措辞，既保留不确定性，
  又不做无证据断言。按「有分歧选最保守且可逆」执行方案 A。

## 最终选择

1. `@tocsin/core` 新增 `DELIVERY_OUTCOME_UNKNOWN_RETRY_ERROR` 与
   `DELIVERY_OUTCOME_UNKNOWN_FINAL_ERROR`，两者都不匹配
   `isDeliveryAcceptedUnrecorded`。
2. `reclaimStaleRunning` 按是否还有重试预算选择文案，保留 `input.error` 覆盖。
3. 兜底 `markFailed` 最多写 2 次；仍失败只记 error 日志，`execute` 返回
   `failed`，不外抛。
4. 不迁移、不改状态机、不改自动重试策略、不改 UI。

## 残余风险

- 自动重发仍可能重复投递：崩溃点可能在发送之后。ping 去重窗口与 stale
  超时同为 5 分钟，重发后的电话是否被去重不能保证（安全专家判定为边界抖动）。
- 兜底两次写都失败时，「目标已受理」的证据仍然丢失，reclaim 只能按
  「结果未知」处理。这是单进程 + 同库写失败的固有限制。
- 终态「结果未知」允许人工重试；是否需要在 UI 加重试确认框与专用徽标，
  留待独立 UI 切片。

## 回滚

单提交 revert；无迁移、无数据改写、无配置变更。已写入的新文案保留，
回滚后这些行仍可人工重试。
