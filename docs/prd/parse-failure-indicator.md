# 接入解析失败指示器与筛选

## 背景

告警源 Webhook 的载荷被告警解析器拒绝时，接入服务会先把载荷记录成一条事件、
再返回 400（`apps/console/src/server/intake/intake.service.ts:192-240,295-318`）。
这样设计的好处是运维还能在事件详情里核对原始载荷；代价是这条「失败」看起来和
一条**正常但未匹配任何路由**的告警完全一样：

- 它没有 `route_matches`，因此不会产生任何投递；
- 顶栏唯一的失败徽标只看 `deliveryState=failed`
  （`apps/console/src/features/deliveries/ui/delivery-failure-indicator.tsx:19-29`），
  而解析失败根本不产生投递，所以顶栏保持全绿；
- 事件列表虽然给这类事件加了「解析失败」徽标
  （`apps/console/src/features/events/ui/event-title-cell.tsx:36-43`），
  但只有在运维主动打开事件列表、并且刚好翻到那一行时才可见。

真实后果：上游监控系统改了载荷格式，Webhook 开始持续返回 400，而 Tocsin 的顶栏、
投递失败指示器、告警源列表都没有变化——告警在接入阶段静默丢失。

## 用户故事

作为一名值班 SRE，当我看到「上游一直在发告警，但 Tocsin 没有任何投递」时，
我希望顶栏能直接告诉我「最近的 Webhook 被解析器拒绝了 N 条」，
并且一点就能落到只包含这些事件、且时间窗口与提示一致的列表，
这样我能立刻区分「上游安静」和「载荷格式变了，告警根本没进来」。

## 范围

1. `ListOperationsInputSchema` 增加 events-only 布尔维度 `parseFailed`
   （`packages/api/src/schemas/operations.ts`）。
2. 仓储 `EventListQuery.parseFailed`，列表与 `total` 使用同一谓词
   （`apps/console/src/infra/sqlite/repositories/history/history.repository.ts`）。
   谓词以 `json_valid` + `json_extract(... '$.parseFailed')` 实现，与
   `parseFailureMetadataFrom` 的读法一致：元数据损坏的行按「未标记」处理，
   `false` 分支不会因为 `NULL` 把它们漏掉。
3. 请求映射：`operations.service.ts` 把维度转成 events 查询；
   `operation-search.ts` 用 URL 字符串 `"true"` / `"false"` 承载布尔值，
   `normalizeOperationFilters` 保留 `false`（其他维度用真值判断，会把它丢掉）。
4. 事件页筛选面板增加「解析结果」下拉（任意 / 解析失败 / 解析成功）与可清除 chip。
5. 顶栏新增 `ParseFailureIndicator`：最近 24 小时解析失败数 > 0 时显示，
   点击落到 `/events?parseFailed=true&range=24h`，与徽标计数同窗口。

## 非目标

- 不改变接入语义：解析失败仍然先写事件、再抛 400，仍然不建投递。
- 不新增趋势图、外发通知、告警源级别的解析失败计数。
- 不因为该维度改变事件列表的默认排序或分页。
- 不把 `provider_metadata_json` 的其他字段暴露成筛选维度。

## 验收标准

- `parseFailed=true` 只返回被解析器拒绝的事件；`parseFailed=false` 返回其余事件
  （包括元数据损坏、按未标记处理的行）；两种情况下 `total` 与列表一致。
- URL `?parseFailed=true` 会进入服务端请求与 TanStack Query 的 query key；
  清除 chip 或「重置筛选」后该维度消失。
- 解析失败数为 0 时顶栏不渲染徽标；查询失败时同样不渲染（不把瞬时错误变成第二个告警）。
- 徽标的可访问名称包含计数，标题说明「这些载荷没有产生任何投递」。
- 无数据库迁移，无新增依赖。

## 架构边界

- 契约：`packages/api`（仅新增可选输入字段，向后兼容）。
- 服务/仓储：`apps/console/src/server/operations/`、`apps/console/src/infra/sqlite/repositories/history/`。
- UI：`features/events/ui`（指示器）、`features/operations/ui`（筛选控件与 chip）、
  `shell/dashboard-header.tsx`（挂载点）。
- 不触及投递、路由匹配与鉴权语义；不新增 schema 或迁移。
