# 事件详情一键静默指纹

> 状态：已交付（PR #116）。以下「问题」段保留交付前的现状记录。

## 问题

- 事件详情页只提供「重新匹配」与「返回列表」两个操作
  （`apps/console/src/features/events/ui/event-detail-page.tsx:49-59`），
  当值班 SRE 确认一条告警会持续刷屏时，必须离开详情页、到「告警静默」页重新选择
  告警源、手工输入指纹、再选时间窗口。
- 指纹是排查时最常用来定位一条告警的字段，但详情页只展示、不提供任何针对该指纹的操作
  （`event-detail-summary.tsx:53-57`）。
- 手工复制指纹再回填容易出错：指纹只在同一个上游系统内唯一，漏选告警源会静默掉其他
  上游系统的同名告警。

## 用户故事

- 作为值班 SRE，我在事件详情页确认一条告警正在刷屏后，可以一键打开已预填「当前告警源 +
  当前指纹」的静默规则表单，确认时间窗口后直接创建。
- 作为值班 SRE，我仍然可以在保存前调整匹配条件（例如追加严重级别、通知目标），
  因为静默规则会比这条事件活得更久。
- 作为值班 SRE，创建成功后停留在事件详情页，不需要在页面之间往返。

## 范围

- 事件详情工具栏新增「静默此指纹」操作，打开复用现有 `CreateSuppressionForm` 的对话框。
- 表单预填：`name`（`静默：<事件标题>`，超长截断）、`sourceIds=[当前告警源]`、
  `fingerprints=[当前指纹]`、默认两小时窗口；其余条件保持空白。
- 提交调用现有 `suppressions.create` oRPC procedure，成功后刷新静默规则查询并提示；
  失败时以 toast 展示错误，对话框保持打开。
- 仅当事件加载成功时显示该操作；事件不存在时不显示。
- 中英文文案同步。

## 非目标

- 不新增服务端接口、DTO、数据库字段或迁移。
- 不自动创建静默规则，也不提供「永久静默」：窗口仍由操作员确认。
- 不改变抑制匹配语义（source 与 fingerprint 同时满足才命中）。
- 不在事件列表页批量静默，不做跨事件指纹聚合。

## 验收标准

- 事件详情页存在「静默此指纹」按钮；未加载到事件时不渲染。
- 打开对话框后，规则名称已按事件标题预填，告警源复选框与指纹行已选中/填好。
- 未修改任何字段直接提交：调用 `suppressions.create`，payload 同时包含当前 `sourceId`
  与 `fingerprint`，不触发「静默所有告警」确认。
- 清空全部条件后提交：仍触发既有的空 matcher 二次确认。
- 创建成功：对话框关闭，静默规则列表查询失效（下次进入列表可见），toast 成功提示。
- 创建失败：对话框保持打开，toast 展示失败原因。
- 告警源列表加载失败时展示可读错误，而不是一直停在加载态。
- 中英文 i18n key 对等；表单预填与模型默认值有测试覆盖。

## 架构边界

- `apps/console/src/features/suppressions/model/suppression-form.ts`：新增纯函数
  `suppressionDefaultsFromEvent`，集中定义事件静默的预填语义。
- `apps/console/src/features/suppressions/ui/suppression-forms.tsx`：
  `CreateSuppressionForm` 接受可选的 `defaultValues` 覆盖空白默认值。
- `apps/console/src/features/suppressions/ui/suppression-from-event-dialog.tsx`：
  新增对话框，按需查询告警源与通知目标列表，复用现有创建表单与 mutation hook。
- `apps/console/src/features/events/ui/event-detail-page.tsx`：工具栏接入该对话框。
- `apps/console/src/i18n/messages`：新增中英文文案。
- 无 `server/`、`infra/`、`packages/api`、数据库或投递语义改动。
