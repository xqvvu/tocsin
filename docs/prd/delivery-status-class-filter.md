# 投递列表：按最近一次响应状态类别筛选

## 问题

值班在投递列表排障时，能把列表缩到「失败」或「至少重试 N 次」，但失败原因只能逐行读
`lastError` 自由文本。`delivery_attempts.response_status` 已经落库并用于事件详情的回执投影，
列表却用不上它，于是两种完全不同的故障读起来一样：

- `401` / `403`：多半是我们这边的凭据或目标配置错了，改配置就能恢复；
- `502` / `503`：目标自己不可用，只能等它恢复或改投递路径。

一场事故里几十行失败混在一起时，操作员无法先回答「是不是目标整体挂了」再决定要不要动配置。

## 用户故事

作为值班 SRE，我希望在投递列表上只看「最近一次真正拿到响应的尝试返回了 4xx」或
「……返回了 5xx」的投递，这样我能把配置错误和目标故障分开处理，而不用逐行读错误文本。

## 范围

- 新增 delivery-only 筛选维度 `lastAttemptStatusClass`，取值 `4xx` / `5xx`：
  - `@tocsin/core`：`DeliveryAttemptStatusClassSchema` 与类型。
  - `@tocsin/api` 契约：`ListOperationsInputSchema` 增加可选字段，只影响投递列表。
  - 仓储：`DeliveryListQuery` 增加字段，`listDeliveries` 与 `countDeliveries` 共用同一谓词。
  - 语义：「最近一次已完成尝试」= `state != 'running'` 中 `attempt_number` 最大的那条；
    只有它的 `response_status` 落在 400–499 / 500–599 才命中。后续重试成功会把它移出列表；
    正在运行的尝试不会盖住上一条已完成的结果；没有响应（超时、DNS、TLS）的尝试两个类别都不匹配。
  - 控制台：URL 参数 `lastAttemptStatusClass`、筛选面板下拉、活动筛选 chip、清空与「重置筛选」，
    中英文案。
- 测试：仓储谓词（最新尝试、重试成功、无响应、运行中尝试）、URL 解析/剪枝/合并/清空、
  筛选面板渲染与 chip、service 透传。

## 非目标

- 不落新的 `errorKind` 字段（REQ-209 / REQ-315），不做失败原因分类。
- 不搜索响应体，不改重试映射或退避策略。
- 不为事件列表增加该维度：事件没有「一次尝试」的语义。
- 无 schema 变更、无迁移。

## 验收标准

1. 投递列表选中 `4xx` 时只返回「最近一次已完成尝试」状态码为 4xx 的投递；`5xx` 同理。
2. 列表返回的行数与 `total` 一致（两个查询共用谓词）。
3. 先失败后重试成功的投递不出现在任何类别里。
4. 没有 `response_status` 的失败尝试两个类别都不匹配。
5. 运行中的尝试不会隐藏上一条已完成尝试的状态类别。
6. chip 文案为中文 SRE 术语，清空后 URL 不再包含该参数。
7. 事件列表忽略该参数。

## 架构边界

- 契约在 `packages/core` / `packages/api`，环境中立；URL 状态在
  `features/operations/model/operation-search.ts`；服务层只透传；SQL 谓词在
  `infra/sqlite/repositories/history/`，不进入 entrypoint。
- 只读查询，无新依赖、无新服务、无迁移，可整体回滚。
