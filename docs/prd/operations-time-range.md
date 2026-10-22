# Operations 时间范围过滤

状态：**已实现（本轮 AUTO_SHIP 切片）**
输入：`docs/prd/post-mvp-planning.md` 方向 4「搜索、过滤与历史排障」。

## 一句话结论

Events 与 Deliveries 列表新增 URL 持久化的相对时间范围过滤（最近 15 分钟 / 1 小时 / 6 小时 / 24 小时 / 7 天），
让值班工程师把排障视野收敛到事故时间窗，而不是逐页翻完整历史。

## 1. 问题

Events 和 Deliveries 已经支持 source / severity / status / destination / delivery state / 文本搜索，
但没有时间范围。生产事故中，值班工程师通常只关心「过去一小时发生了什么」；当前只能按每页 20 条
向前翻页，历史越长越难定位。

- 搜索 schema 无时间字段：`apps/console/src/features/operations/model/operation-search.ts:7-25`
- oRPC 输入无时间字段：`packages/api/src/schemas/operations.ts:190-202`
- 仓储查询无时间谓词：`apps/console/src/infra/sqlite/repositories/history/history.interface.ts:23-43`
- 查询与计数路径：`apps/console/src/infra/sqlite/repositories/history/history.repository.ts:41-103,207-321,333-374`
- 文档方向：`docs/prd/post-mvp-planning.md:124-135`

## 2. 用户故事

作为值班工程师，我希望在 Events 和 Deliveries 页面选择「最近 1 小时」之类的相对时间范围，
以便只看事故窗口内的告警与投递，快速判断影响面，而不是逐页翻历史。

## 3. 范围

- URL 新增 `range` 搜索参数，取值 `15m` / `1h` / `6h` / `24h` / `7d`；空值表示全部时间。
- 条件写入 URL，刷新后保留；切换范围时两个列表都回到第 1 页；清除后恢复全量。
- Events 按 `events.received_at` 过滤；Deliveries 按 `deliveries.created_at`（入队时间）过滤。
- 时间窗口由**服务端**按请求时刻计算为绝对下界（`now - 时长`），查询条件为 `>= 下界`，无上界。
- URL 另有可选的 `rangeAnchor`（ISO 时间戳）：操作者选择时间范围时写入当前时刻，
  服务端以它代替请求时刻计算下界（`anchor - 时长`）。这样翻页与分享链接描述的是同一个
  窗口，而不是每次请求都向前滑动的窗口。
- 没有 `rangeAnchor` 的旧链接行为完全不变：下界跟随请求时刻。
- 清除时间范围时同时清除锚点；更换时间范围但没带新锚点时丢弃旧锚点（锚点只对捕获它的
  窗口有效）。
- chip 在存在锚点时显示绝对下界（例如「最近 1 小时 · 自 10/23 04:00」），让分享链接自解释。
- 与现有 source / severity / status / destination / delivery state / `q` 做 AND。
- 列表与 `total` 计数使用同一谓词，保证分页文案与结果一致。

## 4. 非目标

- 自定义绝对起止时间（日期选择器）与时区选择（见 REQ-207）。
- 锚定窗口的**上界**：锚点只固定下界，锚定之后新到达的告警仍会进入列表顶部。这是「新告警
  应当可见」的预期行为；要冻结整个窗口需要绝对起止，属 REQ-207。
- 定时自动刷新与自动重新锚定（见 REQ-35）。
- retention / 自动清理策略。
- 分析报表、聚合图表。
- 为 `received_at` / `created_at` 新增索引或迁移（MVP 数据量下先不加；若需要索引属 migration，另行决策）。

## 5. 验收标准

1. `range=1h` 时，Events 只返回 `received_at >= 服务端 now - 1h` 的事件，Deliveries 只返回
   `created_at >= 服务端 now - 1h` 的投递；两者的 `total` 与 `items` 一致。
2. 非法 `range` 值被 schema 收敛为空（全部时间），不抛错。
3. 修改 `range` 时 `eventPage` / `deliveryPage` 回到 1；分页本身不重置范围。
4. URL 刷新后范围保留；清除筛选后恢复全量。
5. 仓储层测试覆盖边界（恰好等于下界包含、早于下界排除）与空结果形状。
6. 服务层测试用注入时钟固定 `now`，证明 `range` 被正确换算为 `since`。
7. 带 `rangeAnchor` 时下界按锚点计算：同一请求时钟下，锚点把更早的记录纳入窗口；
   翻页请求携带同一锚点时结果集不随请求时刻漂移。
8. 未来锚点被钳制到请求时刻（客户端时钟超前不能让窗口下界落到未来）；不可解析的锚点
   回退到请求时刻；没有 `range` 时锚点被忽略。
9. 更换时间范围会丢弃旧锚点；清除时间范围会同时清除锚点；分页与其他筛选保留锚点。
10. 有锚点时 chip 显示绝对下界，无锚点时文案与既有行为一致。

## 6. 架构边界

- `packages/core/src/operations.ts`：新增 `OperationTimeRangeSchema` 与类型，作为 client-safe 契约。
- `packages/api/src/schemas/operations.ts`：`ListOperationsInputSchema` 增加 `range` 与 `rangeAnchor`。
- `apps/console/src/features/operations/model/operation-search.ts`：URL 校验、prune、页码重置，
  以及锚点的失效规则（无 `range` 或更换 `range` 时丢弃）。
- `apps/console/src/features/operations/api/operations.queries.ts`：查询键包含 `range` 与 `rangeAnchor`。
- `apps/console/src/server/operations/operations.service.ts`：把 `range` 换算为 `since`，时钟可注入；
  锚点优先于请求时钟，未来锚点钳制到请求时刻。
- `apps/console/src/features/operations/model/operation-format.ts`：chip 用的紧凑绝对时间格式。
- `apps/console/src/infra/sqlite/repositories/history/{history.interface,history.repository}.ts`：
  `EventListQuery` / `DeliveryListQuery` 增加 `since`，列表与计数共用。
- `apps/console/src/features/operations/ui/operation-filters.tsx` 与两个页面：范围选择与 chip。
- i18n：`apps/console/src/i18n/messages/{zh-Hans,en-US}.json`。

无数据库 schema 变更，无新增运行时依赖，不改变投递 / 路由 / auth 语义。
