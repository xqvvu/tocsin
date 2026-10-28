# 投递列表按精确指纹过滤

- 状态：已实现（REQ-311）
- 关联：`docs/prd/event-fingerprint-filter.md`（同一维度的事件侧）、
  `docs/prd/event-fingerprint-context.md`（「同指纹」页签）、
  `docs/prd/post-mvp-planning.md` 方向 4（搜索、过滤与历史排障）

## 问题

事件详情页的「同指纹」页签能回答「这条告警之前出现过吗」，事件列表也已支持精确 `fingerprint` 过滤。
但值班真正要确认的下一个问题往往是**这条告警一共发出过多少通知、发给了谁、有没有失败**——
这属于投递维度，而投递列表没有任何指纹条件：

- `DeliveryListQuery` 有 `eventId`、`suppressionId`、`routeId`，唯独没有 `fingerprint`
  （`apps/console/src/infra/sqlite/repositories/history/history.interface.ts`）。
- `listDeliveries` / `countDeliveries` 只按单条事件 id 或跨字段子串 `q` 收窄
  （`history.repository.ts`）。
- 契约与前端模型都把指纹标注为 Events-only
  （`packages/api/src/schemas/operations.ts`、`features/operations/model/operation-search.ts`）。

于是同一个指纹重复 14 次时，值班只能逐条打开事件的「投递」页签；把指纹粘进投递搜索框则会
命中正文里恰好引用该字符串的其它告警，以及指纹更长的告警（`checkout:unavailable` 命中
`checkout:unavailable:eu`）。这正是事件侧当初引入精确维度的同一个缺陷，只是换到了投递列表。

## 用户故事

作为值班 SRE，我在事件详情页确认某条告警已重复出现多次后，希望一键打开「该告警源 + 该指纹」
产生的全部投递，只看到这条告警真正发出的通知（含失败与重试），不掺入正文碰巧包含同一串字符的
其它告警，这样我才能判断这次故障到底通知到了谁。

## 范围

- 投递列表新增精确指纹维度 `fingerprint`，与事件列表共用同一个契约字段：
  - `DeliveryListQuery.fingerprint`（`history.interface.ts`）；
  - `listDeliveries` / `countDeliveries` 对已 join 的 `events.fingerprint` 加等值谓词，
    列表与 `total` 共用同一条件；
  - 复用既有 `idx_events_fingerprint_received_at`，**无迁移**；
  - `operations.service.ts` 把 `fingerprint` 一并透传给投递列表。
- 筛选 chip（「指纹」）在事件与投递两个页面都渲染：读者在两个列表都要能看到并清除该条件。
- 「同指纹」页签的汇总区新增「在投递列表查看该指纹的全部投递」链接，携带
  `sourceId` + `fingerprint`，与页签自身「同源 + 精确指纹」的口径一致。
- 中英文案同步。

## 非目标

- 不改变搜索框 `q` 的语义（仍是跨字段子串匹配，多词 AND）。
- 不在投递筛选面板新增指纹输入框：入口是「同指纹」页签的链接，chip 只用于展示与清除。
- 不做跨源指纹聚合、指纹排行或按指纹批量重试（见 REQ-279 / REQ-6）。
- 不改投递列表的其它维度（`eventId`、`routeId`、`suppressionId` 保持原样）。
- 无 schema、迁移、依赖或外部服务变化。

## 验收标准

1. 仓储层 `listDeliveries({ fingerprint })` 只返回其事件 `fingerprint` 完全相同的投递；
   同一次告警的多次扇出全部包含；`total` 与分页结果同谓词。
2. 同一值用 `q` 搜索会返回更多行（前缀更长的指纹、正文引用），证明两者语义不同。
3. `{ sourceId, fingerprint }` 组合只返回该告警源下的投递，供「同指纹」链接复用。
4. `fingerprint` 与 `state`、`destinationId` 等既有维度可叠加，谓词互相 AND。
5. 不传 `fingerprint` 时投递列表行为不变。
6. 投递页面在 `fingerprint` 生效时渲染「指纹」chip，清除后移除该条件。
7. 「同指纹」页签渲染投递列表链接，链接携带 `sourceId` 与 `fingerprint`。
8. `vp check`、`vp run -r test`、`vp run -r build` 全绿。

## 架构边界

- 契约：`@tocsin/api`（`ListOperationsInputSchema` 的 `fingerprint` 注释由 Events-only 改为两列表共用）；
  `@tocsin/core` 常量 `EVENT_FINGERPRINT_FILTER_MAX_LENGTH` 复用，不新增。
- 入口：现有 `operations.list` oRPC procedure，不新增端点、不改鉴权。
- 服务：`server/operations/operations.service.ts` 仅透传，过滤逻辑留在仓储。
- 持久层：`infra/sqlite/repositories/history/`，只加一个等值 `WHERE`，不动表结构与索引。
- UI：`features/operations`（搜索模型、chip）、`features/events`（「同指纹」页签链接）；
  不引入新的全局状态或样式系统。

## 风险与回滚

- 纯读路径加法：旧 URL、旧客户端、未带 `fingerprint` 的请求均不受影响。
- 回滚只需回退镜像/提交，无数据库操作。
- 已知取舍：与事件侧一致，`fingerprint` 本身不带源维度；手改 URL 清掉 `sourceId` 后会跨源列出
  同值指纹的投递。这是操作者显式动作，且仍是精确等值匹配。
