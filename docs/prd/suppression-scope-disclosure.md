# 静默规则影响范围披露（目标数）

> 状态：已实现（2026-10-22 核实：`urgent-impact-preview.tsx` 已按 `scopedCount` 分支渲染）。
> 以下「问题」节为实现前的历史背景。

## 问题

- 创建/编辑告警静默规则时，表单底部的影响面板只在「有目标开启自动电话提醒」时
  给出人数与名单（`apps/console/src/features/suppressions/ui/urgent-impact-preview.tsx:38-58`）。
- 当范围内没有任何开启自动电话提醒的目标时，面板只显示「不会影响自动电话提醒」
  （`apps/console/src/features/suppressions/ui/urgent-impact-preview.tsx:28-36`），
  不告诉运维「这条规则仍会让多少个已启用的通知目标收不到告警」。
- 模型层其实已经算出范围内全部已启用目标的数量 `scopedCount`
  （`apps/console/src/features/suppressions/model/urgent-impact.ts:16,43`），
  但 UI 从未使用它。
- PRD 要求创建/启用静默前展示命中范围与范围内开启自动加急的目标数量
  （`docs/prd/alert-suppression.md:287`）。当前只兑现了后半句。
- 边界情况更危险：当范围内所有目标都已停用（例如编辑时选中的目标后来被停用），
  面板仍显示「不会影响自动电话提醒」，运维会误以为规则仍有静默效果，
  实际上这条规则什么也拦不住。

## 用户故事

- 作为值班 SRE，我在保存静默规则前能看到「这条规则会让 N 个已启用的通知目标
  收不到告警」，即使其中没有目标开启自动电话提醒。
- 作为值班 SRE，当范围内的目标全部停用时，界面明确告诉我这条规则当前不会
  影响任何目标，而不是用「不影响自动电话提醒」含糊带过。
- 作为值班 SRE，当范围内既有会自动呼叫的目标、也有其余会被静默的目标时，
  我能同时看到两类数量，判断影响面是否与预期一致。

## 范围

- 影响面板按三种情况渲染：
  1. `scopedCount === 0`：范围内没有已启用的通知目标，规则当前不产生静默效果；
  2. `scopedCount > 0` 且没有目标开启自动电话提醒：展示范围内已启用目标数；
  3. 有目标开启自动电话提醒：保留现有 destructive 警示，并在范围内还有其他目标时
     追加一行「范围内共有 N 个启用的通知目标，其余目标同样会被静默」。
- 中英文文案同步；组件测试覆盖三种情况与目标范围收窄（`destinationIds`）。
- 文案保持 SRE 用语，避免「抑制」「投递」等实现术语（`apps/console/src/i18n/messages.test.ts:24-40`）。

## 非目标

- 不新增 oRPC procedure、服务端 DTO、数据库字段或迁移；目标列表已在表单中加载。
- 不改变 `urgentImpactPreview` 的计数语义：只有 `destinationIds` 收窄目标范围，
  severity/status/labels 等告警维度无法在不看具体事件的情况下排除目标
  （`apps/console/src/features/suppressions/model/urgent-impact.ts:19-29`）。
- 不在本切片内展示命中告警源/严重程度/状态的汇总（属于后续需求）。
- 不改变空 matcher 的二次确认流程与保存语义。

## 验收标准

- 范围为空（所有目标停用）时，面板显示「范围内没有启用的通知目标」及说明。
- 范围内有 2 个已启用目标、均未开启自动电话提醒时，面板显示
  「范围内有 2 个启用的通知目标，它们的告警仍会被静默，也不能手动加急」。
- 范围收窄到 1 个目标时，计数为 1，不包含范围外目标。
- 有 1 个自动呼叫目标、范围内共 2 个已启用目标时，面板同时显示呼叫名单与
  「范围内共有 2 个启用的通知目标，其余目标同样会被静默」。
- 范围内目标全部开启自动电话提醒时不渲染「范围内共有…」追加行。
- 组件测试覆盖以上分支；`vp check`、`vp run -r test`、`vp run -r build` 全绿。

## 架构边界

- 只修改 `apps/console/src/features/suppressions/ui/urgent-impact-preview.tsx`
  与两份 i18n 文案；模型 `urgent-impact.ts` 保持不变。
- 纯前端只读投影，不触碰 `server/`、`infra/`、oRPC 契约、auth 或投递语义。
- 复用已加载的 `DestinationListItem[]` 与 `SuppressionMatcher`，不新增查询。
- 无新依赖、无 schema 变更、可整体回滚。
