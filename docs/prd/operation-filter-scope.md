# Operations 筛选面板按页面能力渲染与 Deliveries 路由过滤

状态：**已实现（本轮 AUTO_SHIP 切片）**
输入：`docs/prd/post-mvp-planning.md` 方向 4「搜索、过滤与历史排障」；
backlog `REQ-5`。

> 后续：本文 §4 的「Events 按通知目标过滤」非目标与 §5 第 1–2 条验收，
> 已由 `docs/prd/event-destination-filter.md`（REQ-240）取代——
> Events 页现在渲染「通知目标」与「目标投递」，
> `/events?destinationId=` 不再是静默 no-op。路由与投递状态维度仍只在 Deliveries 页。

## 一句话结论

Events 页面只展示它真正能过滤的字段；Deliveries 页面新增按路由过滤。
消除「选了目标或投递状态却毫无效果」的静默 no-op，并补齐路由维度的排障入口。

## 1. 问题

Events 和 Deliveries 两个页面复用同一个筛选面板
（`apps/console/src/features/operations/ui/operation-filters.tsx:31-163`），
但两个页面背后的查询能力并不相同：

- Events 页把 `destinationId` / `deliveryState` 一并写入 URL 并发给服务端
  （`apps/console/src/features/events/ui/events-page.tsx:52-79`），
  而服务端只把它们传给投递查询
  （`apps/console/src/server/operations/operations.service.ts:36-57`）；
  事件仓储 `EventListQuery` 根本没有这两个字段
  （`apps/console/src/infra/sqlite/repositories/history/history.interface.ts:23-33`）。
  结果是：值班工程师在 Events 页选择「目标 = 飞书」「投递状态 = failed」后，
  列表毫无变化，也没有任何提示——这是一个静默 no-op。
- Deliveries 页缺少路由维度过滤。仓储已经 join 了 `routes` 并投影 `route_name`
  （`apps/console/src/infra/sqlite/repositories/history/history.repository.ts:218-232`），
  但 `DeliveryListQuery` 与 `ListOperationsInputSchema` 都没有 `routeId`
  （`history.interface.ts:35-49`、`packages/api/src/schemas/operations.ts:190-202`）。
  排查「某条路由最近把告警投到了哪里」只能翻整页再人工筛。

## 2. 用户故事

作为值班工程师，我希望筛选面板只展示当前页面真正支持的过滤条件，
这样我不会浪费时间在一个不会生效的选项上；
同时我希望在 Deliveries 页面按路由过滤，以便回答
「这条路由最近的投递是成功还是失败、卡在哪个目标」。

## 3. 范围

- `OperationFilters` 新增 `scope: "events" | "deliveries"`：
  - Events：搜索、告警源、严重程度、状态、时间范围。
  - Deliveries：在 Events 的基础上增加目标、路由、投递状态。
- 已激活筛选 chip 同样按 scope 渲染；Events 页不显示目标 / 路由 / 投递状态 chip。
- Deliveries 新增 URL 参数 `routeId`，与现有筛选条件做 AND。
- `routeId` 贯穿 URL schema → oRPC 输入 → 服务 → 仓储的列表与计数，
  列表与 `total` 使用同一谓词。
- 路由下拉选项来自现有 `routesQueryOptions()`；停用路由也保留（历史投递仍可查）。
- 切换 `routeId` 时两个列表都回到第 1 页，与现有筛选行为一致。
- 中文文案使用「路由」「全部路由」；英文使用「Route」「Any route」。

## 4. 非目标

- 让 Events 页支持按目标或投递状态过滤（需要 join 投递表或子查询，
  会改变事件列表的语义与成本，另行决策）。
  **后续**：事件侧的「投递结果」维度已由
  `docs/prd/event-delivery-outcome-filter.md`（REQ-21）单独交付；
  按通知目标过滤已由 `docs/prd/event-destination-filter.md`（REQ-240）交付。
  按投递状态过滤仍不做——Events 用「投递结果」表达扇出结果，
  精确状态留在 Deliveries 页。
- 在 Events 页按路由过滤。
- 保存筛选预设、跨页面共享筛选状态、筛选条件收藏。
- 为 `deliveries.route_id` 新增索引或迁移（MVP 数据量下先不加）。
- 改变筛选面板的视觉布局或交互形态。

## 5. 验收标准

1. Events 页面渲染的筛选字段不含目标、路由、投递状态；Deliveries 页面三者齐全。
   （目标字段随后由 REQ-240 加入 Events，见 `event-destination-filter.md`；
   路由与投递状态仍只在 Deliveries。）
2. 在 Events 页手工构造带 `deliveryState` 的 URL 时，
   面板不显示对应 chip；`destinationId` 已由 REQ-240 改为真实生效。
3. `routeId=<route>` 时，Deliveries 只返回该路由的投递，`total` 与 `items` 一致；
   不存在的路由返回空列表而不是报错。
4. 清空路由筛选后恢复全量；切换路由时 `eventPage` / `deliveryPage` 回到 1。
5. 仓储测试覆盖 `routeId` 命中、未命中与 `total` 一致性；
   服务测试证明 `routeId` 被传入投递查询且不影响事件查询。
6. i18n 中英文键齐全，无硬编码文案。

## 6. 架构边界

- `packages/api/src/schemas/operations.ts`：`ListOperationsInputSchema` 增加 `routeId`。
- `apps/console/src/infra/sqlite/repositories/history/{history.interface,history.repository}.ts`：
  `DeliveryListQuery` 增加 `routeId`，列表与计数共用。
- `apps/console/src/server/operations/operations.service.{ts,types.ts}`：透传 `routeId`。
- `apps/console/src/features/operations/model/operation-search.ts`：URL 校验、prune、页码重置。
- `apps/console/src/features/operations/api/operations.queries.ts`：查询键与输入归一化。
- `apps/console/src/features/operations/ui/operation-filters.tsx`：scope 渲染与路由下拉。
- `apps/console/src/features/{events,deliveries}/ui/*-page.tsx`：传入 scope 与路由选项。
- `apps/console/src/routes/_dashboard.deliveries.tsx`：预取路由列表。
- `apps/console/src/i18n/messages/{zh-Hans,en-US}.json`。

无数据库 schema 变更，无新增运行时依赖，不改变投递 / 路由 / auth 语义。
