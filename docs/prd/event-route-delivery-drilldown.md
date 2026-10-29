# 事件详情的路由投递结果一键下钻

状态：**已实现（本轮 AUTO_SHIP 切片）**
来源：`docs/planning/iteration-backlog.md` REQ-324。

## 一句话结论

事件详情「路由匹配」表里的投递结果徽标从只读数字变成入口：点「失败 1」直接打开投递列表，
列表已按该事件 + 该路由 + 该状态三个维度过滤，值班工程师不必再手工拼三条筛选。

## 1. 问题

事件详情的「路由匹配」页签把每个路由的投递结果按状态聚合成徽标
（`apps/console/src/features/events/ui/event-route-delivery-outcome-cell.tsx:38-53`），但徽标不可点击。
看到「Critical checkout · 失败 1」时，运维想知道「哪条投递失败了、发给哪个目标、最后一次错误是什么」，
只能切换到投递页签逐行比对，或到 Deliveries 列表手工拼条件。

投递列表本身已经支持精确的事件、路由与状态三个维度
（`packages/api/src/schemas/operations.ts:319-331` 的 `routeId` / `eventId` / `deliveryState`，
URL 侧见 `apps/console/src/features/operations/model/operation-search.ts:67-77`），
Events 列表的投递计数徽标也已经这样下钻
（`apps/console/src/features/events/ui/event-delivery-counts-cell.tsx:96-108`）。
缺的只是「按路由」这一层的入口，于是同一份聚合在事件详情里是死路。

## 2. 用户故事

作为值班工程师，我在事件详情的路由匹配表里看到某条路由「失败 1」，希望点一下就得到这 1 条投递
（目标、尝试次数、最后错误），以便判断是该路由的目标配置问题还是上游超时，而不是在投递页签里
逐行找，或回到列表重新拼筛选。

## 3. 范围

- `EventDetailRouteMatchesTable` 接收 `eventId`（`features/events/ui/event-detail-route-matches-table.tsx`），
  由 `EventDetailView` 传入 `detail.event.id`（`features/events/ui/event-detail-view.tsx`）。
- `RouteDeliveryOutcomeCell` 接收 `eventId` / `routeId` / `routeName`，把每个非零状态徽标渲染为
  TanStack Router `Link`，目标 `/deliveries`，search 为
  `{ eventId, routeId, deliveryState }`（`event-route-delivery-outcome-cell.tsx`）。
- 徽标 `aria-label` 与 `title` 说明「状态 + 数量 + 路由名 + 下钻动作」，和 Events 列表计数徽标
  的可访问名称同构。
- 「无投递」「未命中」两种空态保持纯文本，不产生链接。
- 中英文案各一条：`events.detail.routeDeliveryOutcome.filterDeliveries`。

## 4. 非目标

- 不新增 oRPC 输入、DTO 或聚合逻辑：三个过滤维度都已存在并有测试。
- 不改投递领取、路由匹配、加急呼叫或投递状态语义。
- 不改事件详情投递页签的行内结构，也不做批量重试等操作。
- 不新增迁移；`idx_deliveries_event_id` / 路由索引已存在。

## 5. 验收标准

1. 匹配表里每个非零状态徽标都是链接，`href` 携带正确的 `eventId`、`routeId` 与 `deliveryState`。
2. 同一事件的另一条路由的同名状态徽标指向不同的 `routeId`，不会串行。
3. 「无投递」与「未命中」仍是纯文本，页签内不产生链接。
4. 徽标可访问名称包含状态、数量与路由名，读屏可区分同表中多行同状态徽标。
5. `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 6. 架构边界

- 纯前端切片：`features/events/ui` 内完成，不触碰 service、repository、容器装配或 import protection 标记。
- URL 状态仍由 `features/operations/model/operation-search.ts` 与投递路由的
  `validateSearch` 统一收口；`features/events/ui` 只负责构造 `Link` 的 search 对象。
- 徽标语义沿用 shadcn `Badge` 的 `render` 组合方式，与 Events 列表计数徽标保持一致。
