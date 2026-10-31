# 事件列表暴露应投递目标缺口

状态：**已实现（本轮 AUTO_SHIP 切片）**
输入：`docs/planning/iteration-backlog.md` 的 `REQ-381`（requirements 车道第 193 轮）。

## 1. 问题

事件列表的「投递」列只展示已创建的投递计数（`features/events/ui/event-delivery-counts-cell.tsx`），
数据来自 `deliveries` 表的状态聚合（`infra/sqlite/repositories/history/history.repository.ts`
的 `listEvents` 投影）。它回答「已经发了多少条」，却不回答「本来应该发多少条」。

接入时路由快照（`events.route_matches_json`）已经记录了每条命中路由选中的目标
（`packages/core/src/route/route.ts:164-170`），事件详情页也用它与现存投递比对，
列出缺口原因（`infra/sqlite/repositories/history/route-match-gaps.ts`、
`features/events/ui/event-detail-route-gaps.tsx`）。但列表页没有这个信息：

- 运维看到「成功 2」会默认扇出完整，实际快照可能选中了 3 个目标；
- 「投递覆盖」筛选只检查现存投递，文档明确说明它不检查本应接收却没有创建投递的目标
  （`apps/docs/guide/events.md:106`），因此缺口不会进入任何覆盖分类；
- 要发现缺口，必须逐个打开事件详情，与列表的扫视用法不符。

缺口并非都是故障：同指纹去重、路由或目标在接入时已停用、目标已被删除，都会让实际投递少于
快照承诺。但「少于承诺」这个事实本身必须先被看见，排障才有入口。

## 2. 用户故事

作为值班 SRE，我希望事件列表直接标出「接入快照应投递 N 个目标、实际只有 M 条投递」的缺口，
这样我扫一眼列表就能发现扇出不完整的事件，再点进详情查看具体原因，而不必逐个打开事件核对。

## 3. 范围

- `EventListItem` 新增 `expectedDeliveryCount: number | null`
  （`packages/core/src/operations.ts`）：取接入快照中所有 `matched` 路由的
  `destinationIds` 之和，即「路由-目标对」数量；同一目标被两条路由选中计 2。
- 无快照（`route_matches_json` 为 `null`）时返回 `null` 而不是 `0`：直写事件
  （回放夹具、解析失败审计行）从未记录规则意图，`0` 会伪装成「本来就不该投递」。
- `packages/api/src/schemas/operations.ts` 同步字段，类型检查保证实现与契约一致。
- 仓储投影（`history.repository.ts`）一次解码同时得到 `routeMatchCount` 与
  `expectedDeliveryCount`，避免重复解析 JSON。
- 事件列表「投递」列（`event-delivery-counts-cell.tsx`）：当 `expected > 实际总数` 时，
  追加一个「缺 N」徽标，链接到事件详情（缺口原因表所在页面），`title` 说明可能的三种原因。
  `expected` 为 `null`、或实际数已达预期时不渲染。
- 中英文案（`events.table.deliveryGap` / `events.table.deliveryGapTitle`）。
- 测试：仓储投影（缺口、完整、同目标双路由、空目标、未命中、无快照）与单元格
  （缺口徽标、零投递叠加、无快照/无缺口静默）。
- 文档：`apps/docs/guide/events.md` 的「全部送达只核对现存投递」提示补充列表缺口的判读方式。

## 4. 非目标

- 不改「投递覆盖」筛选语义，不新增筛选维度。
- 不为历史事件回填快照，不修改 `events.route_matches_json` 的写入路径。
- 不改事件详情页的缺口原因表（它已经给出逐对的精确原因）。
- 不在列表里推断缺口原因；列表只暴露数字，原因留在详情页。
- 无 schema 变更、无迁移、无新依赖、无环境变量。

## 5. 验收标准

1. 快照命中两条路由、分别选中 `[dest-1, dest-2]` 与 `[dest-1]` 时，
   `expectedDeliveryCount = 3`、`routeMatchCount = 2`。
2. 同一目标被两条路由选中时计 2（按「路由-目标对」而非去重目标数）。
3. 命中路由的 `destinationIds` 为空时计 0；未命中路由不计入。
4. `route_matches_json` 为 `null` 时 `expectedDeliveryCount = null`。
5. 列表单元格在实际投递数少于预期时显示「缺 N」徽标并链接到 `/events/$eventId`；
   相等、超出或未知时不显示。
6. 实际投递为 0 但预期大于 0 时，`0` 徽标与缺口徽标同时出现。
7. `vp check`、`vp run -r test`、`vp run -r build` 全绿。

## 6. 架构边界

- 纯加法：core 类型 + API schema + 读模型投影 + 列表展示，不触碰投递、路由、去重的写入语义。
- 仓储仍在 `history.repository.ts` 内完成 JSON 解码，`routeMatchGaps` 的领域判断不被复制；
  列表只做计数，不重建缺口原因。
- DTO 只增加一个计数，不包含路由或目标身份信息，符合运维可见事实与 secret 边界。
- 可逆：回滚提交即可；新增字段为只读投影，无持久化副作用。
