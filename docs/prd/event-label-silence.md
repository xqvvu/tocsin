# 事件详情按标签一键静默

> 状态：已交付（PR #172）。以下「问题」段保留交付前的现状记录。

## 问题

- 事件详情「标准化」页的标签是纯展示：`event-label-list.tsx:14-39` 只渲染
  `Badge`，没有针对单个标签的操作。
- 现有「静默此指纹」只预填 `sourceIds + fingerprints`
  （`suppression-from-event-dialog.tsx:38-68`、`suppression-form.ts:137-158`）。
  值班 SRE 想静默的往往不是某一条指纹，而是它携带的维度，例如 `env=prod`
  或 `service=checkout`；这类标签在故障期间会持续出现在新告警上，指纹却每次都不同。
- 要按标签静默，操作员必须离开详情页，到「告警静默」页重新选择告警源、手工输入
  `key`、`operator`、`value` 三列（`suppression-forms.tsx:606-660`），容易漏选告警源
  或把 `equals` 误设成 `contains`，把静默范围放大。
- 抑制匹配器原生支持标签维度（`packages/core/src/suppression/suppression.ts:34-43`），
  缺的只是从事件详情发起预填的入口。

## 用户故事

- 作为值班 SRE，我在事件详情页看到一个反复出现的标签（如 `env=prod`）时，可以点它旁边
  的按钮，打开已预填「当前告警源 + 该标签 `equals` 匹配」的静默规则表单。
- 作为值班 SRE，我仍然可以在保存前调整时间窗口、操作符或追加其他条件，因为静默规则
  会比这条事件活得更久。
- 作为值班 SRE，创建成功后停留在事件详情页，不需要在页面之间往返。

## 范围

- `EventLabelList` 的每个标签旁新增图标按钮，可访问名称为
  「静默标签 `<key>=<value>`」；点击打开静默对话框。
- 表单预填：`name`（`静默：<事件标题>`，超长截断）、`sourceIds=[当前告警源]`、
  `labels=[{ key, operator: "equals", value }]`、默认两小时窗口；指纹与其他条件保持空白。
- 复用现有 `CreateSuppressionForm` 与 `suppressions.create` oRPC procedure；成功后刷新
  静默规则查询并提示，失败时 toast 展示原因、对话框保持打开。
- 中英文文案同步。

## 非目标

- 不新增服务端接口、DTO、数据库字段或迁移。
- 不改变抑制匹配语义，也不自动放宽为 `contains`：默认严格 `equals`。
- 不自动创建规则，也不提供「永久静默」。
- 不在事件列表页按标签批量静默，不做跨事件标签聚合。

## 验收标准

- 每个标签旁存在按钮，可访问名称包含该标签的 `key=value`；无标签时仍显示原有空态。
- 打开对话框后，告警源已选中、标签行已填好且操作符为 `equals`、指纹行为空。
- 未修改任何字段直接提交：调用 `suppressions.create`，payload 同时包含当前 `sourceId`
  与标签匹配，不触发「静默所有告警」确认。
- 创建成功：对话框关闭、静默规则查询失效、toast 成功提示；失败：对话框保持打开。
- 中英文 i18n key 对等；预填模型与标签按钮有测试覆盖。

## 架构边界

- `apps/console/src/features/suppressions/model/suppression-form.ts`：新增纯函数
  `suppressionDefaultsFromLabel`，集中定义标签静默的预填语义。
- `apps/console/src/features/suppressions/ui/suppression-from-event-dialog.tsx`：
  接受可选的 `label` 参数，切换预填来源与文案，触发器在该形态下收窄为图标按钮。
- `apps/console/src/features/events/ui/event-label-list.tsx`：改为接收事件详情，
  为每个标签渲染对话框触发器。
- `apps/console/src/features/events/ui/event-normalized-tab.tsx`：传入详情。
- `apps/console/src/i18n/messages`：新增中英文文案。
- 无 `server/`、`infra/`、`packages/api`、数据库或投递语义改动。
