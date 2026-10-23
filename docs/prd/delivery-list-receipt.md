# 投递列表送达回执与「回执缺失」筛选

## 状态

已实现（第 95 轮）。

## 问题

事件详情页已经能回答「这次投递的目标系统是否返回了可反查的消息句柄」（REQ-248，#404）：

- 事件详情的投递表展示 `providerReference` 与最近一次完成的 HTTP 状态；
- 但 `DeliveryListItem` 没有 `providerReference`，投递列表也不渲染回执。

结果是运维在投递列表里排查「这条告警到底送达了没有」时，只能逐条打开投递详情；当一次事件扇出到多个目标、或需要按时间窗口巡检时，这个成本不可接受。另一方面，列表也没有办法反过来筛选「哪些成功/失败投递没有拿到目标回执」，无法快速定位目标端静默吞掉告警的情况。

## 用户故事

作为值班工程师，我希望在投递列表直接看到每条投递的外部消息回执，并能筛选「有回执 / 无回执」，这样不必逐条打开详情就能确认告警是否真正到达目标，或找出目标未返回回执的投递。

## 范围

1. `DeliveryListItem` 增加 `providerReference: ProviderReference | null`：
   - 核心类型 `packages/core/src/operations.ts`
   - oRPC schema `packages/api/src/schemas/operations.ts`
   - SQLite 投影复用既有 `providerReferenceFromRow`（`delivery.helpers.ts:67-75`）
2. 投递列表增加紧凑「回执」列：
   - 有回执时显示可复制的消息句柄，tooltip 带 `type: value`；
   - 无回执时显示 `—`；
   - 列宽固定并截断，完整值仍可通过 tooltip 与复制动作获得。
3. URL 筛选 `receipt=present|missing`：
   - 写入 `DashboardOperationSearchSchema`，服务端 `ListOperationsInputSchema` 接收同名参数；
   - 列表与 `total` 共用同一 SQL 谓词；
   - 筛选面板增加「送达回执」下拉，活跃筛选 chip 可单独清除；
   - 重置筛选会一并清除。
4. 中英文案：`deliveries.table.headers.receipt`、`deliveries.table.receipt.copy`、`operations.filters.receipt*`。

## 非目标

- 不在列表投影最近一次 HTTP 状态与尝试时间：那需要按行 join `delivery_attempts`，成本与页面形状都不合适，仍留在投递详情。
- 不改变投递状态机、不新增状态、不做迁移。
- 不把回执写回路由匹配或证据包。
- 不修改 `provider_reference` 的生成与持久化语义。

## 语义

- `present`：`provider_ref_type` 与 `provider_ref_value` 都非空。只有两半齐全才算可用回执。
- `missing`：其余全部情形，包括尚未投递、投递完成但目标未返回句柄、已抑制，以及历史上只写入一半的脏行。
- 列表与 `total` 使用同一谓词，避免出现「总数说有、翻页看不到」。

## 验收标准

1. 仓储测试：含完整回执的投递只出现在 `receipt=present`；半写回执与无回执行出现在 `receipt=missing`；`present + missing` 的行数与总数一致，且列表与 `total` 同谓词。
2. 服务层测试：`listOperations({ receipt })` 透传到投递列表，事件列表不受影响。
3. URL 模型测试：`receipt` 可解析、非法值回落为空、清空后不写入 URL、变更筛选重置两个列表页码、重置筛选会清除。
4. UI 测试：投递表渲染回执列、可复制句柄、无回执显示 `—`；筛选面板在投递页显示「送达回执」、在事件页隐藏，chip 可清除。
5. 全量 `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- 只读投影 + 前端筛选；无 schema 变更、无迁移、无新依赖。
- SQL 谓词位于 `history.repository.ts`，列表与计数共享；服务层只做参数透传。
- 回执值属于运维标识符而非 secret，与投递详情既有 DTO 的暴露级别一致。
- 不改动投递、路由、鉴权语义。
