# Events 按通知目标筛选

状态：**已实现（本轮 AUTO_SHIP 切片）**
输入：`docs/prd/post-mvp-planning.md` 方向 4「搜索、过滤与历史排障」；
backlog `REQ-240`；`docs/prd/operation-filter-scope.md` §4 的显式非目标
（「让 Events 页支持按目标过滤」）。

## 一句话结论

Events 列表新增「通知目标 + 目标投递」筛选：值班工程师可以直接问
「这条告警到底有没有到 Pager」，也能反过来列出「哪些告警根本没有路由到 Pager」；
同时修掉 `/events?destinationId=` 承诺筛选却毫无效果的静默 no-op。

## 1. 问题

- 筛选面板把目标维度限定在 Deliveries 作用域
  （`apps/console/src/features/operations/ui/operation-filters.tsx:411` 的
  `scope === "deliveries"`），但 URL schema 一直接受 `destinationId`
  （`apps/console/src/features/operations/model/operation-search.ts:30`），
  Events 页也原样把它发给服务端
  （`apps/console/src/features/events/ui/events-page.tsx:42-48`）。
- 服务端只把 `destinationId` 传给投递查询
  （`apps/console/src/server/operations/operations.service.ts:55`），
  事件查询 `EventListQuery` 没有该字段
  （`apps/console/src/infra/sqlite/repositories/history/history.interface.ts:24-63`），
  所以 `/events?destinationId=x` 的列表不会有任何变化。
- 更糟的是 `hasOperationFilters` 把 `destinationId` 计为已筛选
  （`operation-search.ts:169-190`），空列表会显示「筛选后无匹配」
  （`apps/console/src/features/events/ui/events-empty-state.tsx:24-31`），
  而实际上一条筛选都没生效——空态在撒谎。
- 运维现实：告警「没到某个目标」有多种原因（未命中路由、命中的路由未带该目标、
  目标被停用、投递失败或被抑制）。投递列表只能看到「有投递行」的那部分；
  完全没有投递行的事件在目标视角下是隐形的。

## 2. 用户故事

作为值班工程师，我希望在 Events 页按「通知目标」筛选，并选择
「有该目标的投递 / 无该目标的投递」，这样我能直接列出
「该目标从来没收到过的告警」，而不是逐条打开事件详情看投递表。

## 3. 范围

- URL 新增 `destinationMatch`（`delivered` | `missing`）：
  - 省略即 `delivered`，且只在同时选中 `destinationId` 时生效；
  - 默认值不写入 URL，只有 `missing` 会留下参数。
- Events 作用域渲染「通知目标」下拉（与 Deliveries 同一份目标列表），
  选中目标后出现「目标投递」下拉：
  - `delivered` —— 该事件至少有一条投递到该目标（任何状态，含失败/抑制）；
  - `missing` —— 该事件没有任何投递到该目标（含完全没有投递行的事件）。
- 服务端用相关 `EXISTS` / `NOT EXISTS` 子查询实现，列表与 `total` 共用同一谓词；
  计数查询保持原有 join 形状，不会因二次 join 重复计行。
- Events 页的目标 chip 可单独清除；`destinationMatch=missing` 额外显示一个 chip。
- Deliveries 页行为不变：不渲染、不消费 `destinationMatch`。
- 同步修正 `docs/prd/operation-filter-scope.md` 的非目标与验收条款。

## 4. 非目标

- **不**在本筛选里区分「成功 / 失败 / 抑制」。本筛选回答的是
  「该目标有没有收到这条告警的投递行」，与事件列表的投递计数列一一对应；
  `已抑制` 也是投递行，所以计入 `delivered`。
  状态维度由现有的「投递结果」（`deliveryOutcome`）与 Deliveries 页的
  `deliveryState` 负责。
- **不**在 Events 页增加路由、目标类型（kind）维度。
- **不**修复 `hasOperationFilters` 不分页面作用域的既有问题（backlog `Q-15`）：
  `deliveryState` / `routeId` 等纯投递字段出现在 Events URL 时仍会被静默忽略。
- **不**新增索引或迁移：`deliveries.event_id` 已有索引
  （`apps/console/src/infra/sqlite/migrate/schema.ts:266`），相关子查询复用它。

## 5. 验收标准

1. Events 页筛选面板出现「通知目标」；选择目标后出现「目标投递」，
   默认「有该目标的投递」。
2. `/events?destinationId=X` 只返回至少有一条投递到 X 的事件，
   `total` 与列表一致。
3. `destinationMatch=missing` 返回没有任何投递到 X 的事件
   （包括完全没有投递行的事件）。
4. 未选择目标时 `destinationMatch` 被剪除，不写入 URL，也不影响查询。
5. 切换目标或目标投递时两个列表回到第 1 页；chip 可单独清除；
   内联与页面级「重置筛选」都会清空它们。
6. 有筛选时空列表显示「筛选无匹配」；清除后恢复全量。
7. Deliveries 页不渲染「目标投递」，投递查询不受 `destinationMatch` 影响。
8. i18n 中英文键齐全，无硬编码文案。

## 6. 架构边界

- `packages/core/src/operations.ts`：`EventDestinationMatchSchema` /
  `EventDestinationMatch`。
- `packages/api/src/schemas/operations.ts`：`ListOperationsInputSchema.destinationMatch`。
- `apps/console/src/infra/sqlite/repositories/history/history.interface.ts`：
  `EventListQuery.destinationId` / `destinationMatch`。
- `apps/console/src/infra/sqlite/repositories/history/history.repository.ts`：
  `eventDestinationPredicate`，`listEvents` 与 `countEvents` 共用。
- `apps/console/src/server/operations/operations.service.{ts,types.ts}`：
  只传给事件查询。
- `apps/console/src/features/operations/model/operation-search.ts`：
  URL 校验、prune（无目标时丢弃、默认值不落 URL）、chip、页码重置。
- `apps/console/src/features/operations/api/operations.queries.ts`：请求归一化。
- `apps/console/src/features/operations/ui/operation-filters.tsx`：
  Events 作用域的目标与目标投递控件。
- `apps/console/src/i18n/messages/{zh-Hans,en-US}.json`。

无数据库 schema 变更，无新增运行时依赖，不改变投递 / 路由 / auth 语义。
