# Settings UI 页签在移动端可滚动

- 状态：已实现（第 62 轮）
- 相关代码：`apps/console/src/features/configuration/model/settings-layout.ts`、
  `apps/console/src/features/configuration/ui/settings-page.tsx`、
  `apps/console/src/features/configuration/ui/settings-preferences-panel.tsx`

## 问题

`/settings` 的「界面」页签把运维概览、只读运行时信息与偏好设置三块内容叠在一列。
在 390×844 视口下，页签面板实测 `clientHeight = 651px`、`scrollHeight = 863px`，
且计算样式为 `overflow: hidden`；外层内容区同样不滚动。结果是：

- 12 项运行时信息只露出 8 项半，「Worker 超时回收 / 日志格式 / 日志级别」完全不可见；
- 偏好设置表单被压成 26px 高，语言、时区、原文保留天数与「保存设置」按钮都在屏幕外；
- 鼠标滚轮与触摸滑动均无效（`scrollTop` 始终为 0），手机端无法完成设置修改。

桌面 1280×900 下内容恰好放下（747/747），没有这个问题。

## 用户故事

作为值班 SRE，我在手机上打开「设置 → 界面」，希望可以滚动查看全部运行时信息，
并能够滚到偏好设置修改语言/时区或保留天数后点击「保存设置」。

## 范围

- 在 `sm` 断点以下，让「界面」页签自身成为滚动容器（`overflow-y-auto`）。
- 在移动端让偏好设置表单保持内容高度（`flex-none`），避免在滚动容器内被压缩成一条缝。
- `sm` 及以上保持原有固定高度布局（`sm:overflow-hidden`、`sm:flex-1`）。
- 把布局类名提取到 `settings-layout.ts`，并补结构回归测试。

## 非目标

- 不改运行时信息字段、格式或服务端投影。
- 不改偏好设置的提交语义、校验或 i18n 文案。
- 不改 TOML / JSON 页签的布局。
- 不做整体视觉重设计。

## 验收标准

1. 390×844 下「界面」页签 `overflow-y` 为 `auto`，滚轮/触摸能改变 `scrollTop`。
2. 滚到底部时「保存设置」按钮完整进入视口（实测 top 783 / bottom 811，视口 844）。
3. 偏好设置表单高度恢复为内容高度（实测 381px），不再是压缩后的 26px。
4. 1280×900 下布局与修复前一致：面板 `clientHeight = scrollHeight = 747`、
   `overflow: hidden`、表单 446px、保存按钮 y=839–867。
5. 布局回归测试覆盖移动端滚动与桌面端固定高度两个契约。

## 架构边界

仅涉及 `apps/console/src/features/configuration` 的 UI 与模型层；
无 core/api/repository 改动，无迁移，无新增运行时依赖。
