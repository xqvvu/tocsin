# Events 按投递结果筛选

状态：**已实现（本轮 AUTO_SHIP 切片）**
输入：`docs/prd/post-mvp-planning.md` 方向 4「搜索、过滤与历史排障」；
backlog `REQ-21`；上一份 PRD 的显式非目标
（`docs/prd/operation-filter-scope.md` §4「让 Events 页支持按目标或投递状态过滤」）。

## 一句话结论

Events 列表新增「投递结果」筛选：值班工程师可以直接问「哪些告警**根本没投出去**」，
而不是在一屏一屏的事件里找那个显示 `0` 的投递列。

## 1. 问题

事件列表已经展示每条告警的投递状态计数，也能区分「未命中任何路由」与「命中但投递数为 0」
（`apps/console/src/features/events/ui/event-delivery-counts-cell.tsx:37-55`），
但**不能按这个维度筛选**：

- 事件列表查询只支持告警源、严重程度、状态、时间窗、搜索
  （`apps/console/src/infra/sqlite/repositories/history/history.interface.ts:24-38`），
  没有投递维度。
- 顶栏的失败指示器只统计 `deliveryState=failed` 的**投递**
  （`apps/console/src/features/operations/api/operations.queries.ts:95-105`）。
  一条告警如果**没命中任何路由**、或者命中的路由没有配置通知目标，
  它根本不产生投递行（`apps/console/src/server/intake/intake.service.ts` 的扇出只会为
  路由 × 目标建投递），于是既不在投递列表里，也不在失败计数里——静默丢失。
- 筛选面板此前明确不渲染投递维度，见 `docs/prd/operation-filter-scope.md` §4。
  那份 PRD 把「需要子查询、会改变事件列表语义与成本」留作另行决策。本 PRD 就是那个决策。

## 2. 用户故事

作为值班工程师，我希望在 Events 页按「未产生投递 / 含失败投递 / 含已抑制投递」等结果筛选，
这样我能在一个视图里找出「告警进来了，但没有人被通知」的情况，
而不是靠肉眼扫投递计数列或逐条打开事件详情。

## 3. 范围

- 新增 URL 参数 `deliveryOutcome`，只在 **Events** 作用域渲染与生效：
  - `none` —— 该事件没有产生任何投递（未命中路由，或命中的路由没有目标）。
  - `pending` / `running` / `succeeded` / `failed` / `suppressed` ——
    该事件**至少有一条**投递处于该状态。
- 取值集合由 `DeliveryStateSchema` 派生，新增投递状态时筛选选项自动跟上，
  不存在「新状态漏在筛选外」的静默缺口。
- 服务端用相关子查询实现（`NOT EXISTS` / `EXISTS`），列表与 `total` 共用同一谓词；
  计数查询保持原有 join 形状，不会因二次 join 重复计行。
- 已激活筛选 chip、内联「重置筛选」、页面级重置、空态判断
  （`hasOperationFilters`）都包含该字段。
- Deliveries 页不渲染、不消费该参数：投递列表已有精确的 `deliveryState` 维度，
  同一 URL 在两个页面表达不同语义会让人误判。
- 中文文案：「投递结果」「任意投递结果」「未产生投递」「含失败投递」等；
  英文对应 `Delivery outcome` / `No delivery` / `Has failed delivery`。

## 4. 非目标

- **不**新增 `routeMatch=none|any` 维度（未命中路由 vs 命中但无目标）。
  两者当前都归入 `none`，因为运维语义相同——没有人被通知；
  计数列已经分别渲染「未命中路由」与 `0`。路由维度由 backlog `REQ-142` 单独评估。
- **不**给 Events 增加按通知目标或路由过滤（跨表过滤，成本与语义另议）。
- **不**改投递列表的筛选语义，也不把 `deliveryOutcome` 传给投递查询。
- **不**新增索引或迁移：`deliveries.event_id` 已有索引
  （`apps/console/src/infra/sqlite/migrate/schema.ts:265`），
  相关子查询复用该索引。
- **不**修复 `hasOperationFilters` 不分页面作用域的既有问题（backlog `Q-15`）。

## 5. 验收标准

1. Events 页筛选面板出现「投递结果」下拉，选项为「任意 + 未产生投递 + 五种投递状态」；
   Deliveries 页不出现该下拉。
2. `deliveryOutcome=none` 只返回没有任何投递行的事件，`total` 与列表一致。
3. `deliveryOutcome=failed` 返回至少有一条失败投递的事件；
   混合结果的事件（一条成功、一条失败）在 `failed` 与 `succeeded` 下都出现。
4. hand-edited URL 传入未知取值时回落为「不过滤」，不抛错。
5. 该筛选与告警源/严重程度/状态/时间窗/搜索以 AND 组合；翻页时 `total` 描述同一结果集。
6. 切换该筛选时两个列表都回到第 1 页；chip 可单独清除；
   内联与页面级「重置筛选」都会清空它。
7. 有该筛选时，空列表显示「筛选无匹配」而不是「还没有任何告警」。
8. i18n 中英文键齐全，无硬编码文案。

## 6. 架构边界

- `packages/core/src/operations.ts`：`EventDeliveryOutcomeSchema` / `EventDeliveryOutcome`
  （`none` ∪ `DeliveryState`）。
- `packages/api/src/schemas/operations.ts`：`ListOperationsInputSchema.deliveryOutcome`。
- `apps/console/src/infra/sqlite/repositories/history/history.interface.ts`：
  `EventListQuery.deliveryOutcome`。
- `apps/console/src/infra/sqlite/repositories/history/history.repository.ts`：
  `eventDeliveryOutcomePredicate`，`listEvents` 与 `countEvents` 共用。
- `apps/console/src/server/operations/operations.service.{ts,types.ts}`：只传给事件查询。
- `apps/console/src/features/operations/model/operation-search.ts`：URL 校验、prune、
  chip/空态判断、页码重置。
- `apps/console/src/features/operations/api/operations.queries.ts`：查询键与请求归一化。
- `apps/console/src/features/operations/ui/operation-filters.tsx`：events 作用域下拉与 chip。
- `apps/console/src/features/events/ui/events-page.tsx`：页面级重置清空该字段。
