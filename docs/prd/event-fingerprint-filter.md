# 事件列表精确指纹过滤

状态：已交付（REQ-298，第 147 轮）

## 问题

事件详情页的「同指纹」页签回答「这条告警之前出现过吗」。它按「同一告警源 + 完全相同的指纹」
统计全部历史，但表格只展示最近 5 条（`apps/console/src/features/events/ui/event-fingerprint-context-tab.tsx`、
`event-fingerprint-occurrences-table.tsx`）。需要看第 6 条及更早记录时，值班同学只能把指纹复制进
事件列表的搜索框；而搜索框是跨字段 LIKE（`history.repository.ts` 的 `eventSearchPredicate`），
不仅会命中指纹更长的其它告警（例如 `checkout:unavailable:eu` 命中 `checkout:unavailable`），
还会命中正文里恰好引用同一串字符的事件。结果就是「同指纹历史」和「搜索结果」对不上。

## 用户故事

作为值班 SRE，我在事件详情页看到某条告警此前已出现 12 次，希望一键打开这 12 条事件的完整列表，
且列表里只包含同一告警源、完全相同指纹的事件，不掺入正文碰巧包含该字符串的其它告警。

## 范围

- 事件列表新增精确指纹维度 `fingerprint`：
  - URL 搜索参数 `fingerprint`（trim，空值即不过滤）；
  - oRPC 契约 `operations.list` 新增 `fingerprint`（仅事件列表生效，精确等值）；
  - 仓储 `EventListQuery.fingerprint`，列表与 `total` 共用同一 `events.fingerprint = ?` 谓词；
  - 复用既有索引 `idx_events_fingerprint_received_at`，无迁移。
- 事件列表在 `fingerprint` 生效时显示可清除的筛选 chip（「指纹」），清除后回到全量列表。
- 「同指纹」页签的汇总区新增「在事件列表查看全部 N 次」链接，携带 `sourceId` + `fingerprint`，
  与页签自身「同源 + 精确指纹」的口径一致。
- 中英文案同步。

## 非目标

- 不改变搜索框 `q` 的语义（仍是跨字段子串匹配，多词 AND）。
- 不做跨源指纹聚合或排行（见 REQ-279 / REQ-6）。
- 不在筛选面板新增指纹输入框：入口是「同指纹」页签的链接，chip 只用于展示与清除。
- 无 schema、迁移、依赖或外部服务变化。
- 投递列表的精确指纹维度后由 `docs/prd/delivery-fingerprint-filter.md`（REQ-311）单独交付；
  本切片当时只覆盖事件侧。

## 验收标准

1. 仓储层 `listEvents({ fingerprint })` 只返回 `events.fingerprint` 完全相同的事件；
   `total` 与分页结果同谓词；不传值时行为不变。
2. `{ sourceId, fingerprint }` 组合只返回该告警源下的精确匹配，供「同指纹」链接复用。
3. 同一值用 `q` 搜索会返回更多行（前缀更长的指纹、正文引用），证明两者语义不同。
4. URL 中 `fingerprint` 会被 trim 并裁剪到契约上限；空值不写入 URL。
5. `fingerprint` 计入「是否有筛选」判断，空态文案区分「无匹配」与「还没有事件」。
6. 事件列表显示指纹 chip，清除后移除该条件。
7. 服务层把 `fingerprint` 传给事件列表；投递列表在该切片中不接收它（REQ-311 之后两列表共用）。

> 后续：REQ-311（`docs/prd/delivery-fingerprint-filter.md`）把同一维度扩展到投递列表，
> 因此第 6、7 条的「投递列表不显示/不接收」已被取代。
8. `vp check`、`vp run -r test`、`vp run -r build` 全绿。

## 架构边界

- 契约与共享常量：`@tocsin/core`（`EVENT_FINGERPRINT_FILTER_MAX_LENGTH`）、`@tocsin/api`
  （`ListOperationsInputSchema`），保持环境中立。
- 入口：现有 `operations.list` oRPC procedure，不新增端点、不改鉴权。
- 服务：`server/operations/operations.service.ts` 仅透传，过滤逻辑留在仓储。
- 持久层：`infra/sqlite/repositories/history/`，只加一个等值 `WHERE`，不动表结构与索引。
- UI：`features/operations` 的搜索模型与 chip、`features/events` 的「同指纹」页签；
  不引入新的全局状态或样式系统。

## 风险与回滚

- 纯读路径加法：旧 URL、旧客户端、投递列表均不受影响。
- 回滚只需回退镜像/提交，无数据库操作。
- 已知取舍：`fingerprint` 本身不带源维度，手改 URL 清掉 `sourceId` 后会跨源列出同值指纹；
  这是操作者显式动作，且仍是精确等值匹配，不做自动合并。
