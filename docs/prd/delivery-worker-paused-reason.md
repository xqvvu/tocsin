# 暂停期间「运行 worker」的禁用原因可见化

- 状态：已实现（第 69 轮，UI 评审切片）
- 相关代码：`apps/console/src/features/deliveries/ui/deliveries-page-toolbar.tsx`
- 相关文档：`docs/prd/delivery-resume-disclosure.md`、`docs/prd/delivery-backlog-summary.md`

## 问题

全局暂停会禁用 Delivereis 页的「运行 worker」按钮（`deliveries-page-toolbar.tsx:36-50`），
但禁用原因只写在原生 `title` 属性里。原生提示只在鼠标悬停时出现：

- 触屏设备与键盘用户看不到原因，点击无反馈，像是按钮坏了；
- 屏幕阅读器对 `title` 的朗读不稳定，禁用态本身又不可聚焦；
- 暂停横幅在工具栏上方说明了「已暂停」，却没有把「因此不能手动运行 worker」
  这层因果关系说出来，操作员需要在两个区域之间自己建立联系。

## 用户故事

作为值班 SRE，我在投递暂停期间看到「运行 worker」是禁用的，能直接读到
「出站投递已暂停，恢复后才能运行 worker」，而不是先怀疑按钮故障。

## 范围

- 暂停时在工具栏动作区下方渲染一行说明文字（11px，`text-muted-foreground`）：
  - 中文：`出站投递已暂停，恢复后才能运行 worker`
  - 英文：`Outbound delivery is paused, resume it before running the worker`
- 说明文字通过 `aria-describedby` 关联到「运行 worker」按钮，读屏可获取。
- 保留原生 `title`，鼠标悬停行为不变。
- 未暂停或仅因其他操作 pending 而禁用时不显示该说明。

## 非目标

- 不改变暂停/恢复的确认语义：暂停仍一键生效，恢复仍需确认。
- 不改变 worker 的领取逻辑或暂停判定。
- 不改动暂停横幅的视觉样式（中性 Alert 与顶栏 destructive 徽标的差异留给后续
  UI 评审项，见 backlog）。
- 不新增组件或依赖。

## 验收标准

- 未暂停时工具栏不出现暂停说明，按钮无 `aria-describedby`。
- 暂停时说明文字可见，且按钮的 `aria-describedby` 指向该说明元素的 `id`。
- 暂停时按钮仍为禁用态；其他操作 pending 时按钮禁用但不出现暂停说明。
- `vp check`、`vp run -r test`、`vp run -r build` 通过；浏览器在 1280 与 390 宽度下
  确认说明不溢出、不被裁切。

## 架构边界

- 纯前端展示层改动，位于 `features/deliveries/ui`。
- 文案走既有 i18n 扁平键（`deliveries.page.runWorkerPausedHint`），中英文同步。
- 无 oRPC、service、repository 或迁移改动。
