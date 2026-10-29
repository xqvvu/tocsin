# 停用/删除通知目标前披露受影响的告警源

## 问题

停用确认框只回答两件事：有多少条已启用路由引用该目标、队列里有多少待发送投递
（`features/destinations/ui/destination-actions.tsx:142-168`）。删除确认框补充了路由会被
删除还是收窄（同文件 `:240-265`）。两者都没有回答值班工程师在按下确认前真正要判断的问题：
**哪些上游告警源的告警会因此不再送达**。

路由是「告警源 → 通知目标」的中间层：一条路由可以聚合多个告警源（`rule.sourceIds`），
`sourceIds=[]` 表示不限来源（`features/sources/model/source-route-coverage.ts:67-69`）。
因此「3 条路由」无法由操作者心算成告警源：可能是 1 个告警源，也可能是全部告警源。
现有影响模型只有路由维度（`features/routes/model/route-reference-impact.ts:5-10`），
而告警源维度其实已经具备推导条件（`features/sources/model/source-route-coverage.ts:38-67`），
只是方向相反、没有被通知目标的确认框使用。

## 用户故事

作为值班 SRE，我在停用或删除一个通知目标前，希望确认框直接列出会失去这条通知路径的
告警源名称；如果存在不限来源的启用路由，请明确告诉我「所有告警源都受影响（含后续新增）」，
而不是让我逐条打开路由反推。

## 范围

- 新增纯函数 `apps/console/src/features/destinations/model/destination-source-impact.ts`：
  `destinationSourceImpact(destinationId, routes, sources)` 返回受影响告警源数量、名称列表与
  `coversAllSources`。只统计**已启用**路由与**已启用**告警源；`rule.sourceIds=[]` 的启用路由
  视为覆盖全部告警源。
- 新增只读组件 `DestinationSourceImpactNotice`（`features/destinations/ui/`），停用与删除
  确认框共用；受影响告警源为 0 时不渲染，名称超过 5 个时折叠为「前 5 个 + 等 N 个」。
- Destinations 页面加载 `sourcesQueryOptions()`（路由 loader 预取 + `useSuspenseQueries`），
  按行计算并透传到操作列。
- 中英文案各 5 条（标题、两种名称句、全量来源句、名称分隔符）。

## 非目标

- 不新增 endpoint/DTO，不改 oRPC 契约与 `DestinationsListItem` 形状。
- 不改变停用、删除、级联与 `claimNext` 领取语义。
- 不做事件/投递计数，不按严重级别或路由条件拆分受影响范围。
- 不列出已停用的告警源（它们当前不会产生投递）。
- 无 schema、无迁移。

## 验收标准

1. 停用确认框显示受影响告警源数量与名称；存在不限来源的启用路由时改为「所有告警源
   （含后续新增）」的说明。
2. 删除确认框同样显示该区块，位置在路由影响之后、历史数据影响之前。
3. 只有已启用的路由计入；停用路由不影响结果。
4. 只有已启用的告警源计入；路由引用了已不存在的告警源 id 时忽略。
5. 没有受影响告警源时不渲染该区块，不出现「0 个告警源」噪音。
6. 名称超过 5 个时显示前 5 个与剩余数量；中英文案键位对齐。
7. 纯函数与组件都有测试覆盖上述边界。

## 架构边界

- 影响模型是客户端纯函数，放在 `features/destinations/model/`，不调用服务、不读 query 状态，
  与 `destinationRouteCoverage`、`routeReferenceImpact` 同级。
- 页面与路由 loader 只负责取数与透传，符合 route-first 与 TanStack Query 约定；不新增
  server 代码。
- 组件放在 `features/destinations/ui/`，只用 shadcn `Alert` 与语义 token，文案走
  `useTranslations()`。
