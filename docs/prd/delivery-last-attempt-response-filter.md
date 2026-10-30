# 投递列表：按「最近一次是否收到 HTTP 响应」筛选

状态：**已实现（本轮 AUTO_SHIP 切片）**
输入：`docs/planning/iteration-backlog.md` 的 `REQ-364`；需求车道第 186 轮发现；
上一份 PRD `docs/prd/delivery-status-class-filter.md` 的显式缺口。

## 1. 问题

投递列表已经能按「最近一次响应状态类别」（`4xx` / `5xx`）筛选，但那一维度只描述
**目标确实回了响应**的尝试。超时、DNS 解析失败、TLS 握手失败都会让一次尝试以
`response_status = NULL` 结束（`apps/console/src/server/deliveries/delivery-execution.ts:126-158`），
于是最需要先回答的问题——「目标到底通不通」——只能逐行读 `last_error` 自由文本。

一场事故里这两种故障必须分开处理：

- **无响应**：端点不可达、DNS 改错、证书过期、网络策略变更。改投递配置通常没用，
  要先修网络或证书。
- **有响应但失败**（4xx/5xx）：端点活着，问题在凭据、模板或对方服务。

`delivery_attempts.response_status` 已经落库（`apps/console/src/infra/sqlite/migrate/schema.ts:147`），
但列表没有把它用在「有没有响应」这个维度上。

## 2. 用户故事

作为值班 SRE，我希望在投递列表上只看「最近一次尝试根本没拿到 HTTP 响应」的投递，
这样我能立刻判断是目标不可达还是目标在拒绝请求，而不用逐行读错误文本。

## 3. 范围

- 新增 delivery-only 筛选维度 `lastAttemptResponse`，取值 `received` / `missing`：
  - `received` —— 最近一次已完成尝试拿到了 HTTP 状态码（任何类别）。
  - `missing` —— 最近一次已完成尝试结束时没有状态码：超时、DNS、TLS 等。
- 语义与既有 `lastAttemptStatusClass` 完全对齐：
  - 「最近一次已完成尝试」= `state != 'running'` 中 `attempt_number` 最大的那条；
    后续重试会替换更早的结果，不会把投递同时留在两个桶里。
  - 正在运行的尝试不会遮住上一条已完成尝试的结果。
  - 从未完成过任何尝试的投递（排队中、首次尝试进行中、已抑制）两个取值都不匹配。
  - 两个桶对「已尝试过的投递」构成划分：每条最多出现在其中一个。
- 触点：
  - `@tocsin/core`：`DeliveryAttemptResponseSchema` 与类型。
  - `@tocsin/api`：`ListOperationsInputSchema.lastAttemptResponse`，只影响投递列表。
  - 仓储：`DeliveryListQuery.lastAttemptResponse`，`listDeliveries` 与 `countDeliveries`
    共用 `deliveryLastAttemptResponsePredicate`。
  - 控制台：URL 参数、筛选面板下拉、活动筛选 chip、内联与页面级重置、中英文案。
- 测试：仓储谓词（最新尝试替换、超时后恢复、运行中尝试、零尝试）、URL 解析/剪枝/合并、
  筛选面板渲染与 chip、service 透传。

## 4. 非目标

- 不新增失败原因枚举（`REQ-315`），不区分超时 / DNS / TLS 的具体种类。
- 不搜索响应体，不改变重试映射或退避策略。
- 不为事件列表增加该维度：事件没有「一次尝试」的语义。
- 不改变 `lastAttemptStatusClass` 的行为；两者可以 AND 组合，但
  `received` 与 `4xx`/`5xx` 组合时后者更窄，属预期。
- 无 schema 变更、无迁移、无新依赖。

## 5. 验收标准

1. 投递列表选中「无 HTTP 响应」时只返回「最近一次已完成尝试没有状态码」的投递；
   「已收到 HTTP 响应」同理。
2. 列表行数与 `total` 一致（两个查询共用谓词）。
3. 先超时、后重试成功的投递只出现在「已收到响应」下；先成功、后超时的只出现在
   「无 HTTP 响应」下。
4. 从未完成任何尝试的投递两个取值都不匹配。
5. 运行中的尝试不会隐藏上一条已完成尝试的结果。
6. 与投递状态、尝试次数、目标类型等既有筛选以 AND 组合。
7. chip 使用中文 SRE 术语；清空后 URL 不再包含该参数；切换筛选时两个列表回到第 1 页。
8. 事件列表忽略该参数；hand-edited URL 的未知取值回落为「不过滤」，不抛错。

## 6. 架构边界

- 契约在 `packages/core` / `packages/api`，环境中立；URL 状态在
  `features/operations/model/operation-search.ts`；服务层只透传；
  SQL 谓词在 `infra/sqlite/repositories/history/`，不进入 entrypoint。
- 只读查询，复用 `idx_delivery_attempts_delivery_id`，无新依赖、无新服务、无迁移，
  可整体回滚。
