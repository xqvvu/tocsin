# 告警源可投递覆盖率

- 状态：已实现（第 31 轮自主迭代）
- 关联：REQ-129、REQ-7、NEW-A；REQ-318 在此口径上追加「带条件」后缀，
  见 `docs/prd/source-coverage-condition-awareness.md`
- 范围：`apps/console` 前端派生与列表展示，无迁移、无契约变更

## 问题

Sources 列表的「命中路由」列只统计已启用且匹配该告警源的路由，不看这些路由关联的通知目标是否启用
（`apps/console/src/features/sources/model/source-route-coverage.ts:16-26`）。但投递 worker 领取任务时
要求目标处于启用状态（`apps/console/src/infra/sqlite/repositories/delivery/delivery.repository.ts:222-234`）。

因此当一条路由的所有目标都被停用时，Sources 列表仍显示「2 条生效」，operator 会以为告警链路正常，
实际告警只会入队并滞留。REQ-7 已经在投递详情与路由列表提示了滞留，但告警源这一层仍缺一个入口级信号。

## 用户故事

- 作为值班 SRE，我在 Sources 列表就能看出某个告警源的「生效路由」是否真的能把通知发出去，
  而不是等告警发生后去投递详情里发现滞留。
- 作为值班 SRE，当部分路由的目标全部停用时，我能看到可投递路由数，并在悬浮说明里定位是哪几条路由。
- 作为值班 SRE，当所有匹配路由的目标都停用时，我能在列表里看到明确的阻断态，并知道恢复方式
  （启用任一关联目标）。

## 范围

1. `sourceRouteCoverage(sourceId, routes, destinations)` 增加目标输入，派生：
   - `deliverableRouteCount`：已启用、匹配告警源、且至少关联一个已启用目标的路由数。
   - `blockedRouteCount` / `blockedRouteNames`：已启用、匹配告警源、但关联目标全部停用或不存在的路由。
   - 保留既有 `enabledRouteCount`、`directRouteCount`、`catchAllRouteCount`、`routeNames`。
2. Sources 列表「命中路由」列展示：
   - 有可投递路由：`{count} 条可投递`。
   - 有匹配路由但 0 条可投递：`目标全停用`（destructive badge）。
   - 无匹配路由：维持 `未匹配路由`。
   - 悬浮说明区分「全部可投递」「部分路由目标停用」「全部目标停用」，并列出路由名。
3. Sources 页面与 route loader 复用 `destinationsQueryOptions()` 查询，不新增服务端过程。
4. Sources 行内「停用告警源」确认的影响面文案继续使用「匹配的已启用路由数」，语义不变。

## 非目标

- 不改变投递入队、领取、重试或滞留语义。
- 不新增服务端 DTO、oRPC 过程或数据库字段。
- 不把目标停用造成的滞留计入告警源健康分或自动修复。
- 不改变 Routes 列表已有的「N 个目标已停用」展示。

## 验收标准

- [ ] 已启用路由关联一个已启用目标时，该路由计入可投递数。
- [ ] 路由关联多个目标、其中至少一个启用时，该路由计入可投递数。
- [ ] 路由关联的目标全部停用或引用不存在的目标时，该路由不计入可投递数，并出现在停用路由名单中。
- [ ] 停用的路由无论目标状态如何都不计入任何计数。
- [ ] catch-all 路由（`sourceIds` 为空）与指定告警源路由的计数口径保持不变。
- [ ] 列表在「全部可投递」「部分阻断」「全部阻断」「未匹配路由」四种状态下渲染不同文案与 badge 变体。
- [ ] 中英文 i18n 键保持 parity；文案不含句号，符合 `messages.test.ts` 约束。
- [ ] `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- 派生逻辑放在 `features/sources/model/source-route-coverage.ts`，只依赖 `@tocsin/core` 类型。
- 展示放在 `features/sources/ui/source-route-coverage-cell.tsx`，不引入服务端逻辑。
- 数据来自既有 `routes.list` 与 `destinations.list` 查询；Sources route loader 只增加一次
  `ensureQueryData(destinationsQueryOptions())` 预取。
- 无 schema、迁移、依赖或投递语义变化，可逐文件回滚。
