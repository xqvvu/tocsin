# 静默规则启停前的投递后果确认

> 状态：已实现（2026-10-22 核实：`suppressions-section.tsx` 的启停动作已带确认流程）。
> 以下「问题」节为实现前的历史背景。

## 问题

- 告警源、路由、通知目标的停用都有二次确认，并说明停用后的投递后果
  （`apps/console/src/features/sources/ui/source-actions.tsx:143-155`、
  `apps/console/src/features/destinations/ui/destination-actions.tsx:131-156`、
  `apps/console/src/features/routes/ui/routes-section.tsx:235-241`）。
- 静默规则的启停是唯一没有确认的同类电源操作：点击图标立即调用 `setEnabled`
  （`apps/console/src/features/suppressions/ui/suppressions-section.tsx:302-314`，
  第 47 轮 ui-review 在浏览器中复现，记为 UI-14）。
- 两个方向都有实际风险：
  - 关闭一条正在生效的规则会立即恢复符合条件的告警通知，包括自动电话提醒；
    全量静默规则被误关闭时，值班同学会突然收到一批本应被压住的告警。
  - 启用一条已过结束时间的规则不会产生任何效果，但界面只显示「已结束」，
    操作者容易误以为已经生效。
- 删除确认文案只说明「后续通知不再按这条规则暂停」
  （`apps/console/src/i18n/messages/zh-Hans.json:996`），没有说明删除一条
  **正在生效** 的规则会立即恢复发送（REQ-190）。

## 用户故事

- 作为值班 SRE，在关闭一条正在生效的静默规则前，我要看到「符合条件的告警会恢复
  发送，包括自动电话提醒」，避免误点导致告警洪峰。
- 作为值班 SRE，在启用一条静默规则前，我要知道它会立即生效、将在开始时间生效，
  还是因为已过结束时间而不会生效。
- 作为值班 SRE，在删除一条正在生效的静默规则前，我要知道删除等同于立即恢复发送。
- 作为值班 SRE，当我取消确认时，规则状态必须保持原样。

## 范围

- 静默规则列表的行操作：启停按钮改为打开确认框，确认后才调用 `onToggle`。
- 确认文案按规则状态分支，状态由 `suppressionStateAt`
  （`packages/core/src/suppression/suppression.ts:82-107`）投影；被关闭的规则用
  `enabled: true` 投影其时间窗，以便判断「启用后会不会生效」。
  - 关闭：生效中 → 立即恢复发送；待开始 → 开始时间到达时也不会生效；已结束 →
    不改变当前告警通知。
  - 启用：生效中 → 立即暂停发送；待开始 → 开始时间到达时开始暂停；已结束 →
    不会生效，提示先编辑结束时间。
- 删除确认：规则当前生效时使用更明确的文案，说明立即恢复发送；其余状态保留原文案。
- 新增中英文文案键 `suppressions.toggle.*` 与
  `suppressions.delete.confirmDescriptionActive`。
- 新增组件测试覆盖：关闭生效中规则、取消、启用时间窗内规则、启用已结束规则、
  关闭待开始规则、删除生效中规则、删除非生效规则。

## 非目标

- 不改变 `setEnabled` / `delete` 的服务端语义、oRPC 契约或数据库。
- 不新增「暂停到某时间」「延长静默」等规则操作。
- 不在确认框中重新计算影响目标数量；本切片只解释启停与删除的投递后果。
- 不改动静默规则表单内的全量静默二次确认
  （`apps/console/src/features/suppressions/ui/suppression-forms.tsx`）。

## 验收标准

- 点击启停图标只打开确认框，不立即发出 `setEnabled`；确认后才调用一次，取消不调用。
- 生效中规则关闭确认框显示「立即停止生效，符合条件的告警会恢复发送通知，包括自动
  电话提醒」；英文对应 `stops silencing immediately` 与 `resume delivery`。
- 已结束规则启用确认框显示「启用后不会生效，请先编辑结束时间」。
- 待开始规则关闭确认框显示「在开始时间到达时也不会生效」。
- 删除当前生效规则的确认框说明立即恢复发送；删除已结束规则保留原文案。
- 中英文键位对齐，中文文案不含「抑制」「投递」「静默一切」，且无句号或分号。
- `vp check`、`vp run -r test`、`vp run -r build` 全绿。

## 架构边界

- 纯前端切片：只改 `apps/console/src/features/suppressions/ui/suppressions-section.tsx`
  与 i18n 消息文件，不触碰 `server/`、`infra/`、oRPC 契约、auth 或投递语义。
- 状态推导复用 `@tocsin/core` 的 `suppressionStateAt`，不在 UI 里重写时间窗比较。
- 沿用 shadcn `AlertDialog` 与现有行操作模式，不引入新组件库或样式系统。
- 无迁移、无新依赖；回滚只需还原该组件与消息键。
