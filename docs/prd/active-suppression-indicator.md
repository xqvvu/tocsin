# 全局静默生效提示

> 状态：已交付（PR #161）。以下「问题」段保留交付前的现状记录。

## 问题

告警静默（Suppression）是 Tocsin 里唯一会「主动让告警消失」的机制。当前只有进入
`/suppressions` 页面才能看到哪些规则正在生效。值班工程师停留在 Events、Deliveries、
Sources 等页面时，如果发现没有新告警或没有新投递，无法区分：

- 上游监控系统确实安静；
- Webhook 接入已经失效；
- 一条（尤其是无条件匹配的）静默规则正在吞掉所有告警。

最后一种情况最危险：控制台看起来一切正常，而实际没有任何通知被发出。

## 用户故事

作为值班 SRE，我在控制台的任意页面都能立即看到「当前是否有静默规则在生效」，
并且当存在无条件静默（会静默全部告警）时得到明确的视觉警示；我可以一键进入
静默列表查看或处置这些规则。

## 范围

- 在 dashboard 顶部 header 常驻一个静默状态指示器。
- 复用已有 `suppressions.list` oRPC 查询，不新增 procedure、不改数据库。
- 使用 `suppressionStateAt` 在客户端派生状态，只统计 `active` 规则。
- 存在生效规则时显示数量，点击跳转 `/suppressions`。
- 存在生效的无条件规则（matcher 全部维度为空）时，改为「全量静默生效中」并使用
  destructive 语义，避免误判为系统健康。
- 状态按时间推进：规则到达 `endsAt` 后，指示器在下一个刷新周期（≤30 秒）内消失。
- 中英文文案同步。

## 非目标

- 不新增静默创建、编辑、停用入口（仍由 `/suppressions` 页面负责）。
- 不改变静默匹配、路由或投递语义。
- 不在 header 内展开规则明细列表或弹层；悬停标题只列出规则名称。
- 不统计 `scheduled` / `expired` / `disabled` 规则。
- 不引入新的运行时依赖或全局状态库。

## 验收标准

1. 没有生效中的静默规则时，header 不渲染任何额外元素，布局与现状一致。
2. 有 N 条生效规则时，显示「生效中的静默：N 条」（英文
   `Active suppressions: N`），点击进入 `/suppressions`。
3. 存在生效的无条件规则时，显示「全量静默生效中」（英文
   `All alerts are silenced`），使用 destructive Badge 变体，仍可点击进入列表。
4. `scheduled`、`expired`、`disabled` 规则不计入数量；规则到期后指示器自动消失。
5. 查询加载中或失败时指示器不渲染，且不影响 dashboard 其余部分。
6. 模型单测覆盖 active 过滤、无条件规则判定与名称投影；组件测试覆盖空态、
   普通生效、全量静默、非 active 状态与跳转目标。

## 架构边界

- 纯前端切片，不触碰服务端、持久化或 oRPC 合同。
- 纯派生逻辑放在 `apps/console/src/features/suppressions/model/suppression-summary.ts`。
- 展示组件放在 `apps/console/src/features/suppressions/ui/active-suppression-indicator.tsx`。
- `apps/console/src/shell/dashboard-header.tsx` 只负责布局组合，不内联静默业务规则。
- 数据来自已有的、受 dashboard 鉴权保护的 oRPC 查询；不新增敏感字段暴露。
