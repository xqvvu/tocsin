# 告警静默规则的条件范围披露

> 状态：已实现（2026-10-22）。

## 问题

- 创建/编辑告警静默规则时，表单底部的影响面板只回答「有多少个开启自动电话提醒的
  目标会受影响」（`apps/console/src/features/suppressions/ui/urgent-impact-preview.tsx`），
  不回答「这条规则具体命中哪些告警」。
- 抑制 PRD 的安全护栏要求创建/启用前展示命中的 **source、severity/status** 范围，
  以及范围内开启自动加急的目标数量（`docs/prd/alert-suppression.md:99`、
  `docs/prd/alert-suppression.md:287`）。此前只兑现了后半句
  （`docs/prd/suppression-scope-disclosure.md`）。
- 条件清单在表单里是分散的多组勾选（`suppression-forms.tsx:368-408`）。当规则收窄到
  某个告警源或只覆盖某些严重级别时，运维需要自己在多组控件之间拼出结论；规则一旦保存，
  影响的是真实告警，拼错没有二次提醒。
- 边界情况更危险：规则引用的告警源后来被停用或删除时，界面上没有任何提示，运维会
  以为规则仍在拦截该源的告警。

## 用户故事

- 作为值班 SRE，我在保存静默规则前能看到这条规则命中哪些告警源、哪些严重级别和
  哪些告警状态，而不是只看到受影响的电话目标数。
- 作为值班 SRE，当规则没有限制某个维度时，界面明确写「所有告警源 / 所有严重级别 /
  所有状态」，让我知道范围是全局的。
- 作为值班 SRE，当规则引用的告警源已停用或已删除时，界面直接标出来，避免我误判
  规则仍在生效。

## 范围

- 在 `UrgentImpactPreview` 之前新增一个只读「命中范围」面板，逐行展示：
  - 告警源：选中源名称，逗号分隔；未限制时显示「所有告警源」；停用源追加「（已停用）」；
    已删除源以 id 显示并追加「（已删除）」。
  - 严重级别：选中级别的中文/英文标签；未限制时显示「所有严重级别」。
  - 告警状态：同上。
- 当指纹、标签、标题包含、消息包含任一条件存在时，追加一句「另有指纹、标签或
  标题 / 消息条件，会进一步收窄命中范围」，不逐条罗列取值（表单控件就在上方）。
- 中英文案同步，中文保持 SRE 用语；组件测试覆盖五个分支。

## 非目标

- 不新增 oRPC procedure、服务端 DTO、数据库字段或迁移；告警源列表已随表单加载
  （`CreateSuppressionForm` / `EditSuppressionForm` 的 `sources` 属性）。
- 不展示「有多少条历史告警会被命中」：那需要服务端按 matcher 聚合，属于后续需求。
- 不改变 `urgentImpactPreview` 的计数语义与目标范围收窄逻辑。
- 不改变空 matcher 的二次确认流程与保存语义。

## 验收标准

- 空 matcher 时，面板同时显示「所有告警源」「所有严重级别」「所有状态」。
- 选中 2 个告警源（其中 1 个停用）时，面板显示两个名称，停用项带「（已停用）」标记。
- 规则引用已删除的告警源时，面板以 id 显示并带「（已删除）」标记。
- 选中 `critical` / `warning` 与 `firing` 时，面板显示对应语言的严重级别与状态标签。
- 仅设置指纹/标签/标题/消息条件时，面板追加「会进一步收窄命中范围」说明。
- `vp check`、`vp run -r test`、`vp run -r build` 全绿。

## 架构边界

- 只新增 `features/suppressions/model/suppression-scope.ts`（纯投影）与
  `features/suppressions/ui/suppression-scope-preview.tsx`，并在
  `suppression-forms.tsx` 中渲染；i18n 文案两份。
- 纯前端只读投影，不触碰 `server/`、`infra/`、oRPC 契约、auth 或投递语义。
- 复用已加载的 `SourceSummary[]` 与 `SuppressionMatcher`，不新增查询、无新依赖、
  无 schema 变更，可整体回滚。
