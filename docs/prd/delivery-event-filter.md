# 事件投递计数下钻与投递列表按事件过滤

状态：**已实现（本轮 AUTO_SHIP 切片）**
来源：`docs/planning/iteration-backlog.md` REQ-294。

## 一句话结论

Events 列表里的投递计数徽标从「只读数字」变成入口：点「失败 3」直接打开投递列表，列表已按该
事件与失败状态过滤，值班工程师不必再复制事件 ID 去搜索框里做模糊匹配。

## 1. 问题

Events 列表的 `EventDeliveryCountsCell` 只是不可点击的徽标
（`apps/console/src/features/events/ui/event-delivery-counts-cell.tsx`）。看到某条告警「失败 3」时，
唯一的下钻方式是把事件 ID 粘进 Deliveries 的搜索框，而搜索是对事件标题、消息、事件/投递 ID 等
字段做 LIKE 模糊匹配（`apps/console/src/infra/sqlite/repositories/history/history.repository.ts`
的 `deliverySearchPredicate`），既慢又不精确：同一个 ID 子串可能命中别的行，也无法与投递状态组合。

本切片之前，投递列表本身没有 `eventId` 维度（`history.interface.ts` 的 `DeliveryListQuery`、
`packages/api/src/schemas/operations.ts` 的 `ListOperationsInputSchema`），所以「这条告警到底发给了
谁、哪几条失败」在运维视角下缺少一条直接路径。

## 2. 用户故事

作为值班工程师，我在 Events 列表看到一条告警的「失败 3」，希望点一下就得到这 3 条投递（目标、
尝试次数、最后错误），以便立刻判断是目标配置问题还是上游超时，而不是先复制事件 ID 再搜索。

## 3. 范围

- 投递查询新增精确的事件维度：`DeliveryListQuery.eventId`
  （`apps/console/src/infra/sqlite/repositories/history/history.interface.ts`），
  `listDeliveries` 与 `countDeliveries` 使用同一个谓词，保证分页与 `total` 一致。
- oRPC 输入 `ListOperationsInputSchema` 新增 delivery-only 的 `eventId`；operations service 透传给
  投递查询，不影响 Events 查询。
- URL 状态新增 `eventId`（`DashboardOperationSearchSchema`）：已计入「是否有筛选」、包含在共享的
  `clearedOperationSearch` 中、变更时两个列表都回到第 1 页；空值不写入 URL。
- Events 列表的非零投递徽标变为链接：`/deliveries?eventId=<id>&deliveryState=<state>`；「0」与
  「未匹配路由」徽标保持不可点击。
- Deliveries 页显示出「事件」筛选 chip（值为事件 ID），可单独清除或用「清除全部筛选」重置。
- 中英文案同步；中文沿用 SRE 术语（事件、投递、筛选）。

## 4. 非目标

- 不做事件详情内嵌投递表改版，不改投递详情页布局。
- 不支持批量重试、按事件批量操作。
- 不给 Events 列表增加「按路由过滤」（仍属独立候选）。
- 不新增迁移：`idx_deliveries_event_id` 已存在
  （`apps/console/src/infra/sqlite/migrate/schema.ts:266`）。
- 不改变投递、路由、去重或 worker 语义。

## 5. 验收标准

1. `listDeliveries({ eventId })` 只返回该事件的投递，`total` 与过滤后的行数一致；未知事件返回空页
   而不是全部投递。
2. `eventId` 可与 `deliveryState` 组合，例如「该事件的失败投递」只返回失败行。
3. `service.listOperations({ eventId })` 只收窄投递列表，Events 列表保持不变。
4. Events 列表中非零状态徽标链接到 `/deliveries`，携带正确的 `eventId` 与 `deliveryState`；
   0 与「未匹配路由」不产生链接。
5. Deliveries 页对 `eventId` 显示可清除的「事件」chip；「清除全部筛选」会一并清除它。
6. `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 6. 架构边界

- 过滤是只读查询维度，落在 history repository 的投递投影内；不新增 service 单例、不改容器装配。
- 共享契约（输入 schema、DTO）仍在 `packages/api` 与 `@tocsin/core`，保持环境中立。
- UI 链接使用 TanStack Router `Link`，URL 状态继续由 `features/operations/model/operation-search.ts`
  统一收口；`features/events/ui` 不直接读写 router search。
