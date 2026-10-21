# 事件详情按标题/消息一键静默相似告警

状态：已实现（2026-10-21）。

## 问题

- 事件详情顶部只展示标题与消息，没有任何针对文本的操作入口
  （`apps/console/src/features/events/ui/event-detail-summary.tsx:51-54`）。
- 现有「静默此指纹」预填 `sourceIds + fingerprints`
  （`suppression-from-event-dialog.tsx:75-88`、`suppression-form.ts:147-169`）。
  但值班 SRE 常遇到的是同一类告警反复到达、指纹每次不同（例如上游按实例或
  时间生成 fingerprint），而标题或消息中的稳定片段（`DiskFull`、
  `connection timeout`）才是真正的共同维度。
- 标签列已有「静默此标签」入口（`event-label-list.tsx:37-50`），但标题与消息
  没有对应入口；操作员只能离开详情页，到「告警静默」页手工重建条件
  （`suppression-forms.tsx:413-425`），容易漏选告警源或误用 `equals`/`contains`。
- 抑制匹配器本身已支持 `titleContains` / `messageContains`
  （`packages/core/src/suppression/suppression.ts:43-44,207-208`），匹配为
  大小写不敏感的子串包含（`packages/core/src/route/route.ts:314-334`），
  缺的只是从事件详情发起预填的入口。

## 用户故事

- 作为值班 SRE，我在事件详情看到反复出现的标题或消息时，可以点它旁边的按钮，
  打开已预填「当前告警源 + 该文本片段包含匹配」的静默规则表单。
- 作为值班 SRE，我可以在保存前收窄或放宽文本片段、调整时间窗口与追加其他条件，
  因为静默规则会比这条事件活得更久。
- 作为值班 SRE，创建成功后停留在事件详情页，不需要在页面之间往返。

## 范围

- 在事件详情摘要的标题与消息旁各新增一个图标按钮，可访问名称分别为
  「按标题静默相似告警」「按消息静默相似告警」。
- 表单预填：
  - `name`：`静默：<事件标题>`（超长截断，复用现有模板）。
  - `sourceIds=[当前告警源]`。
  - 标题入口：`titleContains=[当前标题]`；消息入口：`messageContains=[当前消息]`。
  - 默认两小时窗口；指纹、标签与其他维度保持空白。
- 复用现有 `CreateSuppressionForm` 与 `suppressions.create` oRPC procedure；
  成功后刷新静默规则查询并提示，失败时 toast 展示原因、对话框保持打开。
- 当前文本为空或包含脱敏占位符时禁用入口，并说明原因：空片段会被
  `suppressionMatcherFromValues` 丢弃，从而把规则悄悄放大成「静默该告警源全部告警」；
  含脱敏占位符的文本与库内原值不相等，按它创建的条件永远不会命中。
- 中英文文案同步。

## 非目标

- 不新增服务端接口、DTO、数据库字段或迁移。
- 不改变抑制匹配语义：仍为大小写不敏感的子串包含，不做正则或分词。
- 不自动截断消息中的动态片段（如实例名、时间戳），由操作员在表单中调整。
- 不自动创建规则，也不提供「永久静默」。
- 不在事件列表页批量静默，不做跨事件文本聚合。

## 验收标准

- 事件详情标题与消息旁各存在一个按钮；可访问名称包含对应字段。
- 打开标题入口后：告警源已选中、`titleContains` 含当前标题、指纹行为空；
  消息入口对应 `messageContains`。
- 未修改任何字段直接提交：调用 `suppressions.create`，payload 同时包含当前
  `sourceId` 与单个 `titleContains` / `messageContains`，且不会退化为空匹配器。
- 文本为空或含 `[REDACTED]` 时按钮禁用，`title` 属性说明原因。
- 中英文 i18n key 对等；预填模型与摘要按钮有测试覆盖。

## 架构边界

- `apps/console/src/features/suppressions/model/suppression-form.ts`：新增纯函数
  `suppressionDefaultsFromText`，集中定义标题/消息静默的预填语义。
- `apps/console/src/features/suppressions/ui/suppression-from-event-dialog.tsx`：
  接受可选的 `text` 参数，切换预填来源与文案；该形态下触发器收窄为图标按钮。
- `apps/console/src/features/events/ui/event-detail-summary.tsx`：在标题与消息旁渲染
  对话框触发器，并负责空值/脱敏禁用判定。
- `apps/console/src/i18n/messages`：新增中英文文案。
- 无 `server/`、`infra/`、`packages/api`、数据库或投递语义改动。
