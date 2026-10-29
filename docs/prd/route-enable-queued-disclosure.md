# 重新启用路由前披露集中补发积压

## 背景

停用路由后，新事件不再匹配它，已经创建的投递停在 `pending`：worker 的领取查询要求
`destinations.enabled = 1` 且路由已启用（`apps/console/src/infra/sqlite/repositories/delivery/delivery.repository.ts:252`）。
重新启用路由后，下一次 worker 运行会立即按 `next_attempt_at` / `created_at` 顺序批量领取这些积压投递。

启用分支此前是一个无确认的裸按钮（`apps/console/src/features/routes/ui/routes-section.tsx:339-354`）：
点一下路由就恢复匹配，操作者既看不到有多少投递在等它，也不知道这些投递是否真的会发出去。
同一文件的停用分支已经有确认框和排队计数（`routes-section.tsx:287-333`），通知目标的启用分支
在 #703 中已经改成确认框并同时披露排队投递与加急呼叫（`destination-actions.tsx:196-244`）。
路由侧是这条对称性里唯一缺失的一环。

真实后果：维护窗口结束后，运维只想着「把路由放回去」，却顺手放出了一批按旧告警产生的通知；
或者反过来，以为积压会自动补发，实际这些投递仍被停用的目标或静默规则挡住。

## 用户故事

作为一名值班 SRE，在维护窗口结束、准备重新启用一条路由时，我希望确认框直接告诉我
「现在有多少条投递在等这条路由」，并说明「启用后它们会被立即处理，但仍受通知目标启用状态、
告警静默和全局投递暂停约束」，这样我能判断是该先启用目标、先解除静默，还是先清理积压。

## 范围

1. 路由行的启用分支改为 `AlertDialog` 确认，结构与同文件停用分支对称：
   标题、描述（路由名 + 关联目标数）、取消/确认。
2. 复用 `QueuedDeliveriesNotice`，`scope: { routeId }`，读取该路由 `pending` 投递数；
   计为 0 时也显式显示「排队中的投递：0 条」，因为「没有积压」正是打开确认框想得到的答案。
3. 新增 `routing.enable.*` 文案（`zh-Hans` / `en-US` 同键），说明集中补发与仍然生效的约束。
4. 文档站 `apps/docs/guide/routes.md` 的停用/启用说明补充确认框与约束口径。

## 非目标

- 不取消、撤回或重新匹配排队投递；不改变 worker 的领取、退避、静默与全局暂停语义。
- 不做批量启停（REQ-322）。
- 不新增服务端计数接口或聚合查询；复用 `operations.list` 已有的 `pending` + `routeId` 过滤与 `total`。
- 不在路由列表常驻展示排队数（计数只在确认框打开时挂载）。

## 验收标准

- 点击启用不再直接切换：先弹出确认框，取消或按 Esc 不调用 `onToggle`。
- 确认框显示标题、包含路由名与目标数的描述，以及该路由的排队投递计数。
- 计数查询失败或仍在加载时不阻塞确认（沿用 `QueuedDeliveriesNotice` 的 advisory 语义）。
- 排队的 0 条时，确认框仍显示计数行。
- 确认后调用 `onToggle(route)`，行为与停用确认一致。
- 两个语言文件的键保持齐平；`vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

纯前端切片：`features/routes/ui`、i18n 文案与文档站页面。无 oRPC 契约、service、repository、
数据库 schema、迁移或依赖改动；计数来自既有 `features/operations/api/operations.queries.ts`
的只读查询，且只在对话框内容挂载时发起，因此配置表不会为每一行扇出一个 count 请求。
