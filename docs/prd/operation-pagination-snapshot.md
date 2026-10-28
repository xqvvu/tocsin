# 事件／投递列表的翻页结果集锚定

- 状态：已实现（REQ-308）
- 关联：`docs/prd/post-mvp-planning.md` 方向 4（搜索、过滤与历史排障）

## 问题

Events 与 Deliveries 两个运维列表都用 offset 分页（`page × limit`），而查询只有
`since` 一个下界，没有上界：

- `apps/console/src/infra/sqlite/repositories/history/history.repository.ts` 的
  `listEvents` / `countEvents` 只加 `events.received_at >= since`；
- `listDeliveries` / `countDeliveries` 只加所选 `timeField` 列的 `>=` 谓词。

于是「读到第 2 页」这件事本身不是原子的快照。只要在读第 1 页与翻到第 2 页之间有一条新告警落库，
整个结果集就往下挪一行，第 2 页会把第 1 页已经看过的最后一行再发一次；反向地，如果翻页过程中
有行被保留策略清理掉，翻页就会跳过一行。排障时这正是最怕的两种偏差：看到的证据重复或者缺失。

现有的 `rangeAnchor` 只解决了一半问题——它冻结的是窗口下界，上界仍然跟着服务器时钟走。

## 用户故事

作为值班工程师，我在排查一次持续告警时，希望「翻到第 2 页、第 3 页」看到的是同一批记录，
不要因为新告警不断涌入而重复或漏掉行，这样我才能确认这次告警的完整影响面。

## 范围

- URL 与契约新增 `rangeUntil`（ISO 时间戳，可选）。
- 前端在**第一次翻页时**捕获一次 `rangeUntil`（整秒），此后每页请求都带上它。
- 服务端把它透传给 `listEvents` / `listDeliveries`，仓储对所选时间列加 **排他** 上界
  （`< rangeUntil`），列表与 `total` 共用同一谓词。
- 筛选条件变化时释放 `rangeUntil`：新的结果集必须重新从第 1 页开始，旧的边界会把符合新条件的行挡掉。
- 顶部出现一枚可清除的 chip（`结果集已锚定 · 翻页起点 <时间>`），说明列表为什么不再滚动。

## 非目标

- 不重写为 keyset / cursor 分页，不改变现有排序（`<时间列> desc, id desc`）。
- 不新增迁移、索引或表结构。
- 不冻结第 1 页：读者还没翻页时列表保持实时，新告警照常出现。
- 不处理保留策略删除行造成的 offset 漂移（属于 keyset 分页的收益范围）。

## 验收标准

1. 仓储层：`until` 为排他上界，事件与投递各自按自己的时间列收窄，`total` 与列表同谓词。
2. 仓储层：第 1 页读到最新一行后插入一条更新的记录，带 `until` 的第 2 页不再重复第 1 页的行；
   不带 `until` 的对照组确实重复（证明缺陷真实存在）。
3. 模型层：第一次翻页写入 `rangeUntil`（整秒）；后续翻页复用它而不是重新捕获；
   筛选条件变化时释放；第 1 页不产生它；非法值被 schema 兜成空串。
4. UI：存在 `rangeUntil` 时渲染可清除 chip，清除后回到实时列表。
5. 清理：`clearedOperationSearch` 包含 `rangeUntil`，「Reset filters」不会留下残留边界。

## 架构边界

- 契约：`packages/api/src/schemas/operations.ts`
- 服务：`apps/console/src/server/operations/operations.service.ts`（透传，不含业务判断）
- 仓储：`infra/sqlite/repositories/history/{history.interface.ts,history.repository.ts}`
- 前端模型／查询／UI：`features/operations/{model/operation-search.ts,api/operations.queries.ts,ui/operation-filters.tsx}`
- 无迁移、无新增依赖、无新可部署服务。
