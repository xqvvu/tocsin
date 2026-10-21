# 投递列表按通知目标类型筛选

- 状态：已实现（2026-10-21，第 58 轮）
- 相关 backlog：REQ-206
- 相关文档：`docs/prd/post-mvp-planning.md` 方向 4（搜索、过滤与历史排障）

## 问题

值班在排障时经常需要回答「飞书这条链路是不是整体挂了」「Slack 和邮件哪个目标类型失败更多」。
当前 Deliveries 列表只能按具体通知目标（单条配置）或路由筛选，无法按适配器类型聚合：

- 列表 DTO 已经带有 `destinationKind`（`packages/core/src/operations.ts:106-111`），但只用于渲染图标
  （`features/deliveries/ui/delivery-target-cell.tsx`）。
- 筛选条件里没有对应字段，operator 只能逐个目标切换筛选，或在浏览器里目视统计。
- 当某个类型的适配器集中失败（例如飞书限流），无法用一次筛选看到全部受影响投递。

## 用户故事

作为值班工程师，我希望在投递列表按「通知目标类型」（飞书 / Slack / 邮件 / 通用 Webhook）筛选，
以便快速判断某一类下游渠道的健康状况，并把结果分享给同事。

## 范围

- Deliveries 页 URL 新增 `destinationKind`，取值来自 `DestinationKindSchema.options`：
  `generic_webhook` / `feishu` / `slack` / `email`。
- `operations.list` 契约新增可选 `destinationKind`，只作用于投递列表；事件列表不受影响
  （与 `routeId`、`destinationId`、`deliveryState` 的既有语义一致）。
- SQLite 历史仓储在列表查询与 `total` 计数上共用同一个 `EXISTS` 谓词，保证分页与总数一致。
- 筛选面板只在 Deliveries 作用域渲染该控件；生效时显示可移除的筛选 chip；「重置筛选」清空它。

## 非目标

- 不新增按类型聚合的统计视图或图表。
- 不改变投递、路由、加急或静默的语义。
- 不新增数据库迁移或索引；`destinations.kind` 已有索引需求由现有主键连接承担。
- 不做多值（多选）类型筛选。

## 验收标准

- `GET /deliveries?destinationKind=feishu` 只显示投递到飞书目标的投递，分页总数与列表一致。
- 未知/非法 `destinationKind` 在 URL 边界回退为「全部类型」，不抛错。
- Events 页即使 URL 带有 `destinationKind` 也不显示该控件，事件列表不受影响。
- 中英文界面均显示「通知目标类型 / Destination kind」，选项复用 `destinations.kinds.*` 文案。
- 覆盖：仓储层列表 + total、operations service 透传、URL 搜索模型、筛选面板与 chip。

## 架构边界

- 契约：`packages/api/src/schemas/operations.ts`（oRPC input）。
- 服务：`apps/console/src/server/operations/operations.service.ts` 透传到历史仓储。
- 持久化：`apps/console/src/infra/sqlite/repositories/history/`，列表与计数共用谓词。
- UI：`features/operations/model/operation-search.ts`（URL 状态）、
  `features/operations/ui/operation-filters.tsx`（筛选控件与 chip）。
- 无迁移、无新依赖、无新的服务端可部署单元。

## 回滚

移除 URL 字段与契约字段即可；服务端忽略未知字段，数据库与投递行为不受影响。
