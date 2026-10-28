# 告警源覆盖列区分「全量覆盖」与「仅条件覆盖」

- 状态：已实现（第 160 轮自主迭代）
- 来源：REQ-318（requirements lane，第 158 轮补记，第 159 轮复核成立）
- 相关：`docs/prd/source-deliverable-coverage.md`、`docs/prd/source-partial-coverage-visibility.md`
- 范围：`packages/core` 纯函数 + `apps/console` 前端派生与列表展示，无迁移、无契约变更

## 问题

Sources 列表的「路由覆盖」列只判断两件事：路由是否启用、路由的 `rule.sourceIds`
是否包含（或为空即兜底）该告警源。它完全不看路由规则里的其余条件——
`severities`、`statuses`、`labels`、`titleContains`、`messageContains`
（`apps/console/src/features/sources/model/source-route-coverage.ts:19-26,53-55`，
条件定义见 `packages/core/src/route/route.ts:19-26`）。

于是「一条仅匹配 `severity=critical` 的路由」和「一条无条件投递全部告警的路由」在列表里
读数完全相同，都是「1 条可投递」。值班 SRE 会据此认为该告警源的每一条告警都会被通知，
而实际上非 critical 的告警一条都不会发出。真正判定是否命中要看 `evaluateRouteMatch`
（`packages/core/src/route/route.ts:182-208`），它在匹配期才把条件算进去。

列表现有文案把「覆盖」（route 会匹配这个 source）与「投递全部告警」混为一谈，
这是本需求要消除的歧义。

## 用户故事

作为值班 SRE，我在告警源列表扫视时，需要区分「这条源的所有告警都会被这条路由转发」与
「这条路由只在这个源的部分告警满足条件时才转发」，这样我不会把条件路由误判为全量覆盖。

## 范围

1. `packages/core/src/route/route.ts` 新增并导出纯函数
   `routeRuleHasEventConditions(rule)`：当规则带有 severity / status / label /
   titleContains / messageContains 任一条件时返回 `true`。`sourceIds` 不算事件条件
   ——它正是「覆盖某个告警源」的定义本身。
2. `SourceRouteCoverage` 增加两个字段：
   - `conditionalRouteCount`：可投递路由中带事件条件的条数；
   - `conditionalRouteNames`：这些路由的名称，供悬浮说明列出。
   既有字段口径不变（`deliverableRouteCount` 仍是「启用 + 覆盖该源 + 至少一个启用目标」）。
3. 「路由覆盖」单元格在 `conditionalRouteCount > 0` 时追加后缀
   `· {count} 条带条件`，并在 `title` 里补充一句说明这些路由需要事件满足条件。
   全量覆盖、部分受阻、全部受阻、未匹配路由四种既有分支保持不变。
4. 新增中英文 i18n 键 `sources.table.routes.conditionalSuffix` 与
   `sources.table.routes.conditionalTitle`。

## 非目标

- 不改变覆盖率口径：仍不预测具体事件是否命中，也不按历史事件统计真实命中率。
- 不新增路由级明细弹层、不新增列、不改表格布局。
- 不涉及服务端 DTO、oRPC 过程、持久化或迁移。
- 不区分条件类型（例如「仅 severity」与「仅 label」），只表达「是否带条件」。
- 不改 Routes 列表与 Route 表单里的既有条件展示。

## 验收标准

- 规则带 severity / status / label / titleContains / messageContains 任一条件时，
  `routeRuleHasEventConditions` 返回 `true`；只有 `sourceIds` 时返回 `false`。
- 可投递路由全部无条件时，徽标文案与现状完全一致（如「2 条可投递」）。
- 部分可投递路由带条件时，徽标追加「· 1 条带条件」，且 `title` 含带条件路由名单。
- 条件路由若因目标停用而不可投递，只计入受阻断口径，不计入 `conditionalRouteCount`。
- 中英文案键 parity；文案不含句号/分号，符合 `messages.test.ts` 约束。
- `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- 条件判定放在 `packages/core/src/route/route.ts`，与 `evaluateRouteMatch` 同源，
  环境中立，可被 console 与服务端共同复用。
- 派生仍在 `features/sources/model/source-route-coverage.ts`，只依赖 `@tocsin/core`。
- 展示在 `features/sources/ui/source-route-coverage-cell.tsx`，不引入服务端逻辑。
- 无 schema、迁移、依赖或投递/路由语义变化，可逐文件回滚。
