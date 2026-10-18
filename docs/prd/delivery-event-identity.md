# 投递列表显示告警身份

- 状态：已实现（2026-10-19）
- 来源：`docs/planning/iteration-backlog.md` REQ-27
- 相关：`docs/prd/operation-search-identifiers.md`、`docs/prd/delivery-search-fields.md`

## 问题

投递列表的「事件」列只显示告警源名称与事件 ID
（`apps/console/src/features/deliveries/ui/delivery-event-cell.tsx:1-18`）。
事件 ID 是内部标识符，运维在值班时无法从它判断这条投递对应哪条告警、严重程度
如何、是否仍在 firing。要回答这些问题，必须点开投递详情，或跳到事件页再按 ID
搜索一次。

仓储查询其实已经 join 了 `events`（`history.repository.ts:218-237`），但只投影了
`events.source_id` 与 `sources.name`，没有把告警身份带进 `DeliveryListItem`。
这不是数据缺失，而是投影缺失。

## 用户故事

作为值班运维，我打开投递列表排查「为什么这条告警没送达」时，希望每一行都能直接
看到告警标题、严重程度和告警状态，这样我不用离开列表就能判断哪几条投递最紧急、
哪些告警已经恢复、哪些仍在 firing。

## 范围

- 扩展 `DeliveryListItem`，增加三个只读投影字段：
  - `eventTitle`：告警标题。
  - `eventSeverity`：`critical` / `warning` / `info`。
  - `eventStatus`：`firing` / `resolved`。
- 仓储 `listDeliveries` 从已 join 的 `events` 表投影上述字段（不新增 join）。
- 投递列表「事件」列改为：
  - 第一行：严重程度徽标 + 告警标题（标题截断，tooltip 显示全文）。
  - 第二行：告警源名称 · 告警状态 · 事件 ID（mono，截断，tooltip 显示完整
    名称/ID）；`firing` 状态使用强调色，`resolved` 保持中性。
- 抑制规则「命中投递」列表复用同一 DTO，自动获得这些字段；其现有 UI 不变。
- 补充仓储投影测试与单元测试，验证字段来源正确、坏值被 schema 拒绝。

## 非目标

- 不改变投递列表的排序、分页、搜索或筛选语义。
- 不在列表页展示 labels、raw payload、message 或事件详情链接（详情互链是
  REQ-10，单独切片）。
- 不新增数据库列或迁移；字段全部来自既有 `events` 行。
- 不改变抑制命中列表的展示形态。

## 验收标准

1. `DeliveryListItem` 与 `DeliveryListItemSchema` 均包含 `eventTitle`、
   `eventSeverity`、`eventStatus`，且 schema 对未知 severity/status 拒绝解析。
2. `listDeliveries` 返回的每一项都带有对应事件的标题、严重程度与状态；手工投递
   （无 route）同样具备这些字段。
3. 投递列表「事件」单元格同时渲染严重程度徽标、标题、告警源名称、告警状态与
   事件 ID；标题与 ID 都有完整值 tooltip，`firing` 与 `resolved` 有视觉区分。
4. 中英文文案无需新增（复用 `common.severity.*`），机器值不进入翻译资源。
5. 既有测试全部通过，新增测试覆盖仓储投影与单元格渲染。

## 架构边界

- 共享契约：`packages/core/src/operations.ts` 与
  `packages/api/src/schemas/operations.ts`，保持环境中立。
- 持久化：`infra/sqlite/repositories/history/history.repository.ts` 只增加 select
  列与行映射，不改变查询谓词。
- UI：`features/deliveries/ui/delivery-event-cell.tsx` 复用
  `features/events/ui/severity-badge.tsx`，不引入新的图标库或样式系统。
- 不触碰投递/路由/auth 语义，不新增运行时依赖，不改变单进程、SQLite-first、
  自托管形态。
