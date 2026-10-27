# 路由重叠与重复通知预览

状态：**已实现（本轮 AUTO_SHIP 切片）**
来源：`docs/planning/iteration-backlog.md` REQ-296。

## 一句话结论

在 Routes 列表上标出「可能同时命中同一告警、并共享通知目标」的路由对，让值班工程师在收到重复
通知之前就能看出配置里的重叠，而不是事后从两条投递记录反推。

## 1. 问题

投递去重键是 `source_id + idempotency_key + route_id + destination_id`
（`apps/console/src/infra/sqlite/repositories/delivery/delivery.helpers.ts:103-114`），其中包含
`route_id`。因此两条路由命中同一事件、指向同一目标时，Tocsin 会各排一条投递，通知目标收到两次
同样的告警。这是有意的语义（不同路由可以有各自的模板与责任范围），但配置层面没有任何提示。

路由条件为空数组表示「不限」（`packages/core/src/route/route.ts:19-26`），所以两条只差一个条件的
路由很容易被写成事实上重叠。列表当前的规则 chip 只描述单条路由
（`apps/console/src/features/routes/ui/routes-section.tsx` 的 `RouteRuleCell`），叠加路由数量后就
无法用肉眼判断两两关系。

## 2. 用户故事

作为值班工程师，我希望在 Routes 列表上直接看到哪两条路由可能对同一告警重复通知、共享的是哪个
通知目标，以便在事故前调整条件或目标，而不是在收到两条相同告警后排查。

## 3. 范围

- `@tocsin/core` 新增纯函数 `findPotentialRouteOverlaps(routes)`，返回启用路由两两之间
  「条件可同时满足且共享至少一个通知目标」的组合，含双方 id、名称与共享目标 id（保持第一条路由
  的目标顺序）。
- 判定规则：数组条件空即通配；`sourceIds` / `severities` / `statuses` 取交集；`labels` 在同一
  key 上只有「双方都是 equals 且值不同」或「equals 值不包含 contains 子串」才判定为互斥；
  `titleContains` / `messageContains` 是子串要求，始终视为可同时满足。
- Routes 列表在存在重叠时显示提示面板：最多列出 3 对（「A 与 B 共享目标 X」），其余折叠为数量。
- 受影响的路由行在名称旁显示琥珀色「重叠 N」徽标，tooltip 列出对端路由名。
- 只统计**启用**路由与**启用**通知目标：停用目标不会产生重复投递。
- 中文文案沿用 SRE 术语（通知目标、投递、路由），英文文案同步。

## 4. 非目标

- 不阻断保存，不自动合并/停用路由，不修改匹配器语义。
- 不在编辑表单内做草稿级实时提示（列为后续候选）。
- 不做全局重算、子串可满足性求解或「必然重叠」的精确证明；函数结论是保守的「可能重叠」。
- 不新增迁移、不改变投递去重键、不改变 worker 语义。

## 5. 验收标准

1. 两条启用路由共享目标、条件相容时，`findPotentialRouteOverlaps` 返回一对，且
   `sharedDestinationIds` 只含双方共同的目标。
2. 条件在 source / severity / status / label 上任一维度可证明互斥时不返回。
3. 停用路由不参与；共享目标全部停用时不显示提示与徽标。
4. 列表提示最多展开 3 对，其余显示剩余数量；受影响行显示徽标与对端路由名。
5. `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 6. 架构边界

- 判定逻辑是环境中立的纯函数，放在 `packages/core/src/route/route-overlap.ts`，由
  `#core/route/index.ts` 聚合；不引入 `node:*`、SQLite 或 `#/server/*` 依赖。
- UI 只在 `features/routes/ui` 内取值与展示；不新增 oRPC procedure、不改 DTO、不改数据库。
