# 路由状态范围提示

## 问题

路由规则的状态条件可以为空（匹配所有状态），也可以只选其中几种状态。
但表单与列表都没有告诉运维：一旦只选择了部分状态，**未选择的状态就再也不会经过这条路由**。

最常见的配置是「触发中 + 未知」，此时告警恢复通知不会送达；更极端的情况是只选「触发中」。
值班同学往往在事故复盘时才发现「恢复通知没发出来」，而配置当时看起来完全正常：

- 表单的状态条件只有一句通用说明「每个状态一行，不添加时匹配所有状态」
  （`apps/console/src/features/routes/ui/route-forms.tsx:442-444`、
  `apps/console/src/i18n/messages/zh-Hans.json:950`）。
- 路由列表只展示已选状态（`route-rule-summary.ts:76-82`），不提示缺少哪个状态，
  更不说明后果。

## 用户故事

作为值班 SRE，我在编辑或浏览路由时，希望能一眼看出这条路由**不会**投递触发或恢复通知，
以便在保存前确认这是有意为之，而不是配置遗漏。

## 范围

1. **表单内联提示**（`apps/console/src/features/routes/ui/route-forms.tsx`）：
   状态条件选中后，若缺少「触发中」或「已恢复」，在条件列表下方显示 `Alert` 提示，
   说明具体哪一类通知不会送达。两种情况都缺时给出合并提示。
   不阻止保存，不改变已有校验。
2. **列表徽标**（`apps/console/src/features/routes/ui/routes-section.tsx`）：
   规则单元格在已选状态 chip 之后追加一个 `outline` 徽标，
   文案为「不含触发中」「不含已恢复」或「不含触发与恢复」，`title` 给出完整后果说明。
3. **判定模型**（`apps/console/src/features/routes/model/route-form.ts`）：
   新增与语言无关的 `routeStatusScope(statuses)`，返回
   `{ deliversFiring, deliversResolved }`；空状态条件视为两类都投递。
4. **i18n**：zh-Hans / en-US 同步新增 8 个键。
5. **测试**：模型单测（空条件、只选触发、只选恢复、只选未知、两类齐全），
   表单提示的渲染/缺席用例，列表徽标的渲染/缺席用例。

## 非目标

- 不修改 matcher 语义、不阻止保存、不新增校验错误。
- 不改变 `RouteRule` 类型、oRPC 契约、数据库结构。
- 不把提示扩展到告警源、严重程度、标签等其他条件维度（留待后续需求）。
- 不做列表页整体视觉重设计。

## 验收标准

- 编辑一条 `statuses: ["firing"]` 的路由时，表单在状态条件下方显示
  「未包含「已恢复」状态，告警恢复时不会通知」。
- 编辑一条 `statuses: ["firing", "resolved"]` 或 `statuses: []` 的路由时，不显示提示。
- 路由列表中，缺少「触发中」的路由显示「不含触发中」徽标；缺少「已恢复」的显示
  「不含已恢复」；两者都缺的显示「不含触发与恢复」；两类齐全或不设状态条件的不显示。
- 徽标的 `title` 与表单提示语义一致。
- `vp check`、`vp run -r test`、`vp run -r build` 全部通过。

## 架构边界

- 纯前端展示层改动：`features/routes/model` + `features/routes/ui` + i18n 文案。
- 不触碰 `server/**`、`infra/**`、`packages/**`；无 schema、无迁移、无新依赖。
- 判定逻辑放在 `model/route-form.ts`，保持环境中立，可被表单与列表同时复用。
- 文案遵循 AGENTS.md 的 SRE 术语：`firing` 显示为「触发中」、`resolved` 显示为「已恢复」。
