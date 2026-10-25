# 投递列表时间列跟随时间口径

## 状态

已实现（第 105 轮）。

## 问题

投递列表默认按 `deliveries.created_at` 排序与过滤，但表格只有一列「更新时间」
（`updated_at`）。重试或状态变化后，一条较早入队的投递会带着新的更新时间出现在
列表顶部，与排序依据不一致；运维在「最近创建」窗口里看到的时间列并不属于该窗口，
难以判断投递究竟何时入队。

## 用户故事

作为值班 SRE，当我在投递列表按「创建时间」筛选和排序时，我希望表格显示创建时间；
当我切换到「更新时间」口径时，希望表格显示最后一次活动时间。时间列始终与当前
排序/过滤口径一致，列表才不会看起来错乱。

## 范围

- `DeliveryListItem` 增加 `createdAt`（`@tocsin/core` 类型、`@tocsin/api` schema、
  SQLite 仓储投影）。
- 投递表格按 `timeField` 选择列：默认 `created` 显示「创建时间」，`updated` 显示
  「更新时间」；表头与单元格值同时切换。
- 中英文案成对新增 `deliveries.table.headers.created`。
- 测试：仓储投影断言 `createdAt` 来自 `deliveries.created_at`；表格在两种口径下
  的表头与值。

## 非目标

- 不改变 URL 语义、筛选控件、排序方向、分页或 `total` 计算。
- 不新增其他时间口径（例如完成时间、下次重试时间）。
- 不改投递详情页、事件详情投递表或抑制命中表。

## 验收标准

- 默认（`timeField` 为空或 `created`）时表头为「创建时间 / Created」，单元格显示
  `createdAt`，与 `ORDER BY deliveries.created_at` 一致。
- `timeField=updated` 时表头为「更新时间 / Updated」，单元格显示 `updatedAt`。
- 列表过滤、翻页与 `total` 与改动前一致。
- `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- 纯 DTO + UI 投影变更：无迁移、无数据库 schema 变更、无投递/路由/鉴权语义变更。
- `createdAt` 来自既有的 `deliveries.created_at` 列，仓储查询已经在 select 中返回，
  只补映射与契约字段。
- 客户端仍只通过 oRPC DTO 读取数据，不接触 SQLite。
