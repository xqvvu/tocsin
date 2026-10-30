# Events 按投递覆盖情况筛选

状态：**已实现（本轮 AUTO_SHIP 切片）**
输入：`docs/planning/iteration-backlog.md` 的 `REQ-363`；
上一份 PRD `docs/prd/event-delivery-outcome-filter.md` 的显式非目标。

## 一句话结论

Events 列表新增「投递覆盖」筛选：值班工程师可以直接问「这次告警是**全部目标都收到**、
**只到了一部分**，还是**一个都没送到**」，而不必逐行数投递列里的成功数量。

## 1. 问题

Events 页已经有「投递结果」（`deliveryOutcome`）筛选，但它回答的是
「是否存在某个状态的投递」：一条既有 `succeeded` 又有 `failed` 的事件，会同时出现在
`deliveryOutcome=succeeded` 和 `deliveryOutcome=failed` 下
（`apps/console/src/infra/sqlite/repositories/history/history.repository.ts:1103-1116`）。

排障时真正要问的是覆盖率：

- 维护窗口结束后，「哪些告警只通知到了一部分人」——这部分需要逐条补发。
- 目标批量失效时，「哪些告警一个成功投递都没有」——这是需要立即人工介入的集合。
- `deliveryOutcome=none` 表示**根本没有产生投递**（未命中路由或路由无目标），
  与「产生了投递但全部失败/被抑制」是两种不同的故障，无法用同一个筛选表达。

## 2. 用户故事

作为值班工程师，我希望在 Events 页按投递覆盖筛选：
- 「全部送达」——确认一次告警已经覆盖所有目标，不必再看投递表；
- 「部分送达」——找出需要补发的告警；
- 「无人送达」——找出「投递尝试过但没人收到」的告警，区别于「从未投递」。

## 3. 范围

- 新增 URL 参数 `deliveryCoverage`，只在 **Events** 作用域渲染与生效：
  - `all` —— 该事件至少有一条投递，且**所有**投递都是 `succeeded`；
  - `partial` —— 至少一条 `succeeded`，且至少一条不是 `succeeded`；
  - `none` —— 至少有一条投递，且**没有**任何 `succeeded`。
- 三个取值是「至少有一条投递的事件」的完整划分：一条事件最多命中一个覆盖值。
  没有任何投递的事件不落在这三个取值里，继续由 `deliveryOutcome=none` 选择。
- `pending` / `running` / `failed` / `suppressed` 都算「未送达」：`pending`/`running`
  还没有到达任何人，`failed`/`suppressed` 不会到达任何人。
- 服务端用相关 `EXISTS` / `NOT EXISTS` 子查询实现，列表与 `total` 共用同一谓词；
  复用 `idx_deliveries_event_id`，不新增 join、不新增索引。
- 已激活筛选 chip、内联「重置筛选」、页面级重置、空态判断（`hasOperationFilters`）
  都包含该字段。
- Deliveries 页不渲染、不消费该参数：覆盖描述的是事件扇出，投递列表已有精确的
  `deliveryState` 维度。
- 中文文案：「投递覆盖」「任意覆盖」「全部送达」「部分送达」「无人送达」；
  英文对应 `Delivery coverage` / `All delivered` / `Partially delivered` / `None delivered`。

## 4. 非目标

- **不**改变 `deliveryOutcome` 的语义（「是否存在该状态的投递」），也不合并两个筛选。
- **不**把「未产生投递」并入覆盖 `none`：两者是不同故障（未路由 vs 投递全部失败），
  合并会让值班员无法区分。
- **不**按目标或路由筛选（跨表维度，成本与语义另议）。
- **不**新增索引或迁移：`deliveries.event_id` 已有索引
  （`apps/console/src/infra/sqlite/migrate/schema.ts:265`）。
- **不**在投递列表提供该维度。

## 5. 验收标准

1. Events 页筛选面板出现「投递覆盖」下拉，选项为「任意 + 全部送达 + 部分送达 + 无人送达」；
   Deliveries 页不出现该下拉。
2. `deliveryCoverage=all` 只返回「至少一条投递且全部 `succeeded`」的事件；
   `partial` 返回「成功与非成功混合」的事件；`none` 返回「有投递但零成功」的事件。
3. 没有任何投递的事件不出现在以上任一取值下；它仍由 `deliveryOutcome=none` 返回。
4. 列表与 `total` 使用同一谓词，翻页时 `total` 描述同一结果集。
5. hand-edited URL 传入未知取值时回落为「不过滤」，不抛错。
6. 该筛选与告警源/严重程度/状态/时间窗/搜索以 AND 组合；切换时两个列表回到第 1 页。
7. chip 可单独清除；内联与页面级「重置筛选」都会清空它。
8. 有该筛选时，空列表显示「筛选无匹配」而不是「还没有任何告警」。
9. i18n 中英文键齐全，无硬编码文案。

## 6. 架构边界

- `packages/core/src/operations.ts`：`EventDeliveryCoverageSchema` / `EventDeliveryCoverage`
  （`all` | `partial` | `none`）。
- `packages/api/src/schemas/operations.ts`：`ListOperationsInputSchema.deliveryCoverage`。
- `apps/console/src/infra/sqlite/repositories/history/history.interface.ts`：
  `EventListQuery.deliveryCoverage`。
- `apps/console/src/infra/sqlite/repositories/history/history.repository.ts`：
  `eventDeliveryCoveragePredicate`，`listEvents` 与 `countEvents` 共用。
- `apps/console/src/server/operations/operations.service.{ts,types.ts}`：只传给事件查询。
- `apps/console/src/features/operations/model/operation-search.ts`：URL 校验、
  prune、chip/空态判断、页码重置、跨列表不携带。
- `apps/console/src/features/operations/api/operations.queries.ts`：请求归一化。
- `apps/console/src/features/operations/ui/operation-filters.tsx`：events 作用域下拉与 chip。
- `apps/console/src/features/events/ui/events-page.tsx`：页面级重置复用
  `clearedOperationSearch`，无需单独改动。
