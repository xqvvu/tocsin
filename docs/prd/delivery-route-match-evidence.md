# 投递详情的路由命中依据

## 问题

投递详情只显示「路由」名称（`apps/console/src/features/deliveries/ui/delivery-summary-tab.tsx`
中的 `deliveries.detail.terms.route`）。值班工程师看到一条投递后，无法回答：

- 这条路由当时为什么命中这个事件？
- 路由后来被改过吗？现在的规则还能命中吗？
- 为什么事件详情说「接入时未命中」，却仍然产生了投递？

数据其实已经存在：

- 事件记录保存了接入时的路由匹配快照 `event.routeMatches`，其中每个
  `RouteMatchResult.checks` 都带结构化证据（字段、期望值、事件实际值），见
  `packages/core/src/route/route.ts`。
- 投递详情 DTO 同时返回当前路由定义 `route.rule` 与事件快照
  （`packages/core/src/operations.ts` 的 `DeliveryDetail`）。
- 事件详情页已经能渲染这些检查项
  （`apps/console/src/features/events/ui/event-detail-route-matches-table.tsx`），
  但投递详情没有复用。

## 用户故事

作为值班工程师，我打开一条投递，想在不跳转事件页的情况下确认：

1. 接入时是哪条路由、按什么条件命中的；
2. 当前路由规则是什么；
3. 两者是否已经不一致（路由在投递后被编辑或停用）；
4. 如果事件没有快照或这条路由不在快照里，页面要明确说明原因，而不是留白。

## 范围

- 在投递详情「摘要」标签页的字段区下方新增「路由命中依据」区块，并列展示：
  - **接入时快照**：快照中的路由名、命中/未命中、逐项检查证据。
  - **当前规则**：当前路由名、规则摘要（复用 `describeRouteRule`）、按当前规则
    重新评估的逐项检查证据。
- 快照缺失时区分两种事实：
  - 事件整体没有快照（旧数据）→ 说明「早于快照功能」。
  - 有快照但不含这条路由（补投时按当时规则评估）→ 说明「补投按补投时刻的规则评估」。
- 当前规则与接入时结论不一致时显式提示，避免把今天的规则误当作历史解释。
- 手动投递（无路由）不渲染该区块。
- 将路由检查徽章与命中徽章抽到 `features/routes/ui/`，事件详情页与投递详情页共用，
  文案迁到中性的 `routeChecks.*` 命名空间。

## 非目标

- 不修改投递、路由匹配或补投语义；本切片只读。
- 不新增 oRPC procedure 或 DTO 字段；现有 `DeliveryDetail` 已包含所需数据。
- 不做历史规则版本化，也不回填旧事件的快照。
- 不改变事件详情页的布局与行为（仅替换内部复用组件，渲染结果保持不变）。

## 验收标准

1. 有快照且当前规则仍命中：摘要页同时显示两次评估结果，均标记「命中」，
   检查徽章展示「期望值 / 事件实际值」。
2. 当前规则已被改成不再命中：仍显示快照的「命中」，当前规则标记「未命中」，
   并显示「本次投递按当时生效的规则执行」的说明。
3. `event.routeMatches` 为 `null`：显示「该事件接入时没有留下路由快照」。
4. 快照存在但不含该路由：显示「补投按补投时刻的规则评估」。
5. 快照中该路由未命中却存在投递：显示「该投递来自补投」。
6. 手动投递：不渲染「路由命中依据」区块。
7. 事件详情页的路由匹配表渲染结果与改动前一致（文案不变）。
8. `vp check`、`vp run -r test`、`vp run -r build` 全绿。

## 架构边界

- 纯前端切片：`features/deliveries/model/delivery-route-evidence.ts` 负责纯函数推导，
  `features/deliveries/ui/delivery-route-evidence.tsx` 负责渲染。
- 复用的检查徽章属于路由域 UI，放在 `features/routes/ui/`；
  规则摘要 copy 构建器放在 `features/routes/model/`，保持 i18n 运行时与格式化逻辑分离。
- `@tocsin/core` 的 `evaluateRouteMatch` 是唯一匹配语义来源，前端不复制规则判断。
- 不涉及 SQLite、迁移、oRPC contract 或鉴权边界。
