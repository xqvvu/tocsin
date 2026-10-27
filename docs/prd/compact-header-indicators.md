# 顶栏运维指示器在窄屏收缩为图标

## 问题

控制台顶栏（`apps/console/src/shell/dashboard-header.tsx:21-29`）跨页展示三类运维状态：
投递暂停、近期投递失败、生效中的静默规则。三个指示器都放在 `ml-auto flex shrink-0`
容器里，页面变窄时不会换行，只会挤压剩余空间。

投递暂停（`delivery-pause-indicator.tsx:35`）与投递失败（`delivery-failure-indicator.tsx:43`）
都把文案放进 `hidden sm:inline` 的 `<span>`，窄屏只留图标，并用 `aria-label` 保留可读名称。
静默指示器此前（`active-suppression-indicator.tsx:49-53`）无条件渲染全文案，第 134 轮之后
又追加了「{count} 条 30 分钟内到期」后缀，窄屏顶栏的文字量进一步增加。

**状态：已交付（UI-82，PR #542）。** 静默指示器的文案与到期后缀已改成 `hidden sm:inline`，
链接补 `aria-label` 保留完整可读名称，并在 1440×900 / 390×844 双视口浏览器实测无溢出。
以下问题描述保留为切片背景。

## 用户故事

作为值班工程师，我在手机上打开控制台确认告警是否被静默时，希望顶栏保持一排可点的图标，
而不是被一长串文字撑破；同时读屏软件仍能读出完整的静默状态与即将到期数量。

## 范围

- `apps/console/src/features/suppressions/ui/active-suppression-indicator.tsx`：把主标签与
  「即将到期」后缀都包进 `hidden sm:inline`，在链接上加 `aria-label`（含后缀全文），
  `title` 继续展示规则名列表。
- `apps/console/src/features/suppressions/ui/active-suppression-indicator.test.tsx`：断言
  窄屏收缩类名与可访问名称，覆盖「有/无即将到期」两种形态。
- 新增本 PRD。

## 非目标

- 不改三个指示器的查询、显示条件与链接目标。
- 不引入响应式断点体系或新的布局组件；沿用兄弟指示器已有的 `sm` 断点。
- 不改顶栏高度、顺序或颜色。

## 验收标准

1. 视口 `< 640px` 时，静默指示器只显示图标；`≥ 640px` 时显示与现状一致的完整文案。
2. 链接的可访问名称在两种形态下都包含生效规则数与「即将到期」数量（有该状态时）。
3. 三类指示器在 390×844 与 1440×900 下都保持单行、无横向溢出（浏览器实测）。
4. 既有「查询失败时不显示」与「无生效规则时不显示」的行为不变。

## 架构边界

纯前端展示层改动，落在 `features/suppressions/ui`；不涉及 oRPC 契约、service、repository、
SQLite 或 i18n 文案键的新增。文案键复用 `suppressions.indicator.*`。
