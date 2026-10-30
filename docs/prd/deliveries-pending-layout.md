# 投递列表挂起骨架与右侧栏遗留

## 问题

`/deliveries` 的加载骨架（`pendingComponent`）使用 `SkeletonWithRail`，在 xl 断点下渲染
「主列表 + 360px 右栏」两栏；而加载完成后的 `DeliveriesPage` 只渲染单栏。每次进入或切换
筛选条件时，页面都会从两栏跳成单栏（`_dashboard.deliveries.tsx:37`、`deliveries-page.tsx:95`）。

同一条遗留假设还停留在空态文案里：告警源、路由、飞书应用的空态仍告诉运维「新建表单在右侧栏」，
但这三个页面早已把新建入口放在页面工具栏的「新增」按钮，右栏并不存在
（`messages/zh-Hans.json`、`messages/en-US.json` 的 `sources.table.empty.content`、
`routing.table.empty.withDestinations`、`integrations.table.empty.content`）。

## 用户故事

作为值班 SRE，我打开「投递」页排查失败任务时，加载过程中看到的骨架应该和加载完成后的布局一致，
不应出现内容区突然变宽、工具栏位移的跳变；空态提示应直接告诉我「点哪里新建」，而不是指向一个
不存在的右侧栏。

## 范围

- `/deliveries` 的 `pendingComponent` 改用与事件、告警源、路由、通知目标一致的
  `DashboardContentLayout.Skeleton`（单栏）。
- 删除因此变为死代码的 `DashboardContentLayout.SkeletonWithRail`、`DashboardRailSkeleton`、
  `DashboardContentLayout` 的 `sidebar` prop，以及仅被它们使用的 `shell/dashboard-sidebar.tsx`。
- 修正三处空态文案，改为指向工具栏「新增」。

## 非目标

- 不重新引入右侧栏，也不改动任何列表页的信息架构。
- 不调整投递筛选、分页、表格密度或加载时长。
- 不改动移动端/平板断点下的现有单栏行为。

## 验收标准

- xl（≥1280px）视口下进入 `/deliveries`，挂起骨架与加载完成后都是单栏，无 360px 右栏。
- `DashboardContentLayout` 不再接受 `sidebar` prop；仓库内无 `SkeletonWithRail` 引用。
- 告警源、路由、飞书应用空态文案指向工具栏「新增」，中英文一致。
- `dashboard-layout.test.tsx` 断言布局与骨架都不渲染 `complementary` 区域。
- `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

纯前端 shell 与 i18n 文案调整，不涉及 oRPC、service、SQLite、迁移或投递语义；
`DashboardContentLayout` 仍属于 `shell`，保持无业务规则。
