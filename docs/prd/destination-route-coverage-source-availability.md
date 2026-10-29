# 通知目标可达覆盖率（计入告警源启停）

- 状态：已实现（第 175 轮自主迭代）
- 关联：REQ-138；REQ-129（反方向的告警源可投递覆盖率，`docs/prd/source-deliverable-coverage.md`）、
  `docs/prd/destination-route-coverage-conditions.md`
- 范围：`apps/console` 前端派生与列表展示，无迁移、无契约变更

## 问题

「通知目标」列表的「投递路由」列只统计已启用且引用该目标的路由
（`apps/console/src/features/destinations/model/destination-route-coverage.ts`），
不判断这些路由匹配的告警源是否启用。但入队只发生在告警源产生事件之后，
而停用的告警源不会产生任何事件。

因此当一条路由只匹配已停用（或已删除）的告警源时，通知目标列表仍显示「N 条生效」，
operator 会以为该链路可以投递，实际不会有任何告警到达。告警源列表的「命中路由」列
已经计入通知目标启停（REQ-129），本列是它的镜像，却仍按路由配置计数，两个页面
对同一条链路会给出不同结论。

## 用户故事

- 作为值班 SRE，我在通知目标列表就能看出「这些启用路由现在是否真的收得到告警」，
  而不是等告警发生后去事件详情里发现没有投递。
- 作为值班 SRE，当部分路由匹配的告警源全部停用时，我能看到可达路由占比，
  并在悬浮说明里定位是哪几条路由。
- 作为值班 SRE，当所有启用路由都没有可用告警源时，我能看到明确的阻断态，
  并知道恢复方式是启用对应告警源。

## 范围

1. `destinationRouteCoverage(destinationId, routes, sources)` 增加告警源输入，派生：
   - `reachableRouteCount`：已启用、引用该目标、且至少匹配一个已启用告警源的路由数。
   - `blockedRouteCount` / `blockedRouteNames`：已启用、引用该目标，但匹配的告警源
     全部停用或已不存在的路由。
   - `conditionalRouteCount` 改为只在可达路由中统计，避免把不可达路由说成「带条件覆盖」。
   - 保留既有 `enabledRouteCount`、`disabledRouteCount`、`routeNames`。
2. 可达判定：
   - 路由指定告警源（`rule.sourceIds` 非空）时，至少一个被引用的告警源已启用。
   - 兜底路由（`rule.sourceIds` 为空）时，至少存在一个已启用的告警源；
     之后新建的告警源仍会匹配该路由。
   - 已删除的告警源 id 视为不可用。停用的路由不参与任何计数。
3. 「投递路由」列展示：
   - 全部可达：`{count} 条可达`。
   - 部分可达：`{reachable}/{total} 条可达`。
   - 全部阻断：`告警源全停用`（destructive badge）。
   - 无启用路由：维持 `无生效路由`。
   - 悬浮说明列出阻断路由名，并区分「全部可达」「部分阻断」「全部阻断」。
4. Destinations 页复用既有 `sources.list` 查询；route loader 已经预取，不新增服务端过程。

## 非目标

- 不改变入队、领取、重试或投递语义；不判断目标自身启停、静默、全局暂停或去重。
- 不新增服务端 DTO、oRPC 过程或数据库字段。
- 不改变通知目标停用/删除确认里的「生效路由数」口径（仍按启用路由计数）。
- 不把告警源停用造成的不可达计入告警源健康分或自动修复。

## 验收标准

- [x] 已启用路由匹配至少一个已启用告警源时计入可达数。
- [x] 路由匹配多个告警源、其中至少一个启用时计入可达数。
- [x] 路由匹配的告警源全部停用或引用已删除的告警源时不计入可达数，并出现在阻断名单中。
- [x] 兜底路由在没有任何启用告警源时不可达；存在任一启用告警源时可达。
- [x] 停用的路由无论告警源状态如何都不计入任何计数。
- [x] 「带条件」只在可达路由中统计。
- [x] 列表在「全部可达」「部分阻断」「全部阻断」「无生效路由」四种状态下渲染不同文案与 badge 变体。
- [x] 中英文 i18n 键保持 parity，文案不含句号，符合 `messages.test.ts` 约束。
- [x] `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- 派生逻辑放在 `features/destinations/model/destination-route-coverage.ts`，只依赖 `@tocsin/core` 类型。
- 展示放在 `features/destinations/ui/destination-route-coverage-cell.tsx`，不引入服务端逻辑。
- 数据来自既有 `routes.list` 与 `sources.list` 查询；Destinations route loader 已预取两者。
- 无 schema、迁移、依赖或投递语义变化，可逐文件回滚。
