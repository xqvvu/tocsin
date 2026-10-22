# 路由行一键临时静默

## 问题

路由列表的每行只有编辑、历史匹配预览、启停和删除四个操作
（`apps/console/src/features/routes/ui/routes-section.tsx:162-230`）。值班场景里最常见的
诉求是「这条路由命中的告警现在太吵，先压一小时」，而现有手段都有副作用：

- **停用路由**会连同匹配证据一起停掉，事件不再产生投递记录，事后无法从路由视角复盘；
- **删除路由**更重，且丢失配置；
- **到静默页面手填规则**要求运维把路由的 source / severity / label / title / message
  条件逐条抄一遍，容易漏项或写宽。

静默功能本身已经具备同构 matcher（`packages/core/src/suppression/suppression.ts:26-45`
与 `packages/core/src/route/route.ts:18-25` 使用同一套维度词汇），也已有目标行的
一键静默（`apps/console/src/features/suppressions/ui/suppression-from-destination-dialog.tsx`）。
缺的只是路由行这一个入口。

## 用户故事

作为值班运维，我在路由列表里看到一条正在刷屏的路由，点击该行操作里的「临时静默」，
弹窗已按这条路由的规则和目标预填好，我确认时间窗后保存；期间其他路由照常投递，
一小时静默自动到期，路由配置不受影响。

## 范围

- 路由行操作新增「临时静默此路由」按钮（盾牌图标），位置在「预览历史匹配」之后。
- 弹窗预填 matcher：
  - `sourceIds` / `severities` / `statuses` / `labels` / `titleContains` / `messageContains`
    来自该路由的 `rule`；
  - `destinationIds` 来自该路由的 `destinationIds`。
- 时间窗沿用现有默认（当前时间起两小时），可在保存前调整。
- 弹窗文案中文化，沿用静默功能的 SRE 术语。
- 「静默此目标」与「静默此路由」共用一个弹窗主体，避免两份相同的加载/保存逻辑。

## 已知限制

静默规则没有「路由」维度：匹配是按事件与目标判定的。如果另一条路由把同样匹配的事件
投递到同一批目标，这次静默也会同时压掉那条路由的投递。要精确到单条路由，需要给
`SuppressionMatcher` 增加路由维度，属于契约变更，不在本切片范围。

## 非目标

- 不改路由、投递、静默的判定语义，不新增 API、oRPC 过程或数据库表。
- 不做「静默路由后自动停用路由」之类的联动。
- 不做批量静默多行路由。
- 不改静默过期后的任何行为。

## 验收标准

1. 路由列表每一行都有可访问名称为「临时静默 <路由名>」的按钮。
2. 打开后，该路由的 `destinationIds` 全部勾选，其他目标不勾选；路由规则里的
   source / severity / label / text 条件出现在表单对应字段中。
3. 提交时创建一条 `kind: "silence"` 的静默规则，`matcher` 等于
   「路由规则 + 路由目标」，其中不含 fingerprint 等未预填维度。
4. 路由规则为空（匹配所有事件）时，静默仍然限定在该路由的目标上，不会静默所有目标。
5. 保存失败时弹窗保持打开，已填内容不丢。
6. 预填的对象是路由的副本，之后修改表单不会反向改动路由数据。
7. 现有「静默此目标」行为不变，原有测试继续通过。

## 架构边界

- 纯前端切片：`features/suppressions/model` 增加预填函数，
  `features/suppressions/ui` 增加路由行弹窗，`features/routes/ui` 挂载入口。
- 复用 `useSuppressionMutations` 与 oRPC 契约，服务端零改动。
- 不涉及 migration、配置格式、环境变量。
