# 一次性接入 Token 提示条改用 Alert 并支持读屏播报

- 状态：已实现（第 111 轮）
- 来源：UI 评审发现（第 109 轮浏览器实测，backlog `UI-62`）
- 关联：`apps/console/src/features/sources/ui/source-token-notice-panel.tsx`

## 问题

告警源创建成功后，页面顶部会出现一次性接入 Token 提示条。它是运维保存 Token 的**唯一**
机会，但当前实现存在三个可用性问题：

1. **不是标准提示组件。** 提示条用自建 `section` + 左边框模拟 Alert
   （`source-token-notice-panel.tsx:40`），与 `components/ui/alert.tsx` 的
   `Alert / AlertTitle / AlertDescription` 约定不一致，视觉与其它提示条漂移。
2. **读屏用户不会被提醒。** 提示条出现时没有 `role="status"` 或 `aria-live`，屏幕阅读器
   不会播报「告警源创建成功、Token 仅显示一次」。键盘/读屏用户可能直接离开页面，
   永久丢失这枚 Token。
3. **提示语义重复。** `createdDescription` 已写明「关闭提示后将不再显示」，
   底部又渲染一条 `tokenOnceHint`「仅在此处显示，关闭提示后将无法再次查看」
   （`:46-48` 与 `:82-84`）；两个带文字标签的按钮还各自包了一层 `IconTooltip`
   （`:52-72`），鼠标悬停重复朗读按钮名。

## 用户故事

作为使用读屏软件的值班运维，我在创建告警源后，希望页面主动播报「告警源创建成功，
Token 仅显示一次」，并且提示条样式与其它提示一致、文案不重复，这样我不会在不知情时
离开页面而丢掉唯一的接入凭证。

## 范围

- 用 `Alert / AlertTitle / AlertDescription` 重写提示条容器，保留主色左边框以维持
  「创建成功」的强调层级。
- 给提示条加 `role="status"` 与 `aria-live="polite"`：一次性 Token 不是错误，
  用礼貌播报而不是 `role="alert"` 的打断式播报。
- 移除底部重复的 `tokenOnceHint` 文案及其 i18n 键（`sources.notice.tokenOnceHint`）。
- 去掉两个带文字按钮外层的 `IconTooltip` 包装与重复的 `aria-label`；
  按钮的可见文字本身就是可访问名称。
- 增加组件测试：提示条以 `status` 角色渲染且带 `aria-live="polite"`；
  一次性提示只出现一次；复制与「我已保存」行为不变。

## 非目标

- 不改变 Token 的生成、脱敏、存储与传输路径；不改变「只显示一次」的服务端语义。
- 不改变复制按钮的主次层级（「复制 Token」仍是主按钮）。
- 不新增依赖、不改路由与服务端契约。
- 不调整 Sources 列表页其它区域。

## 验收标准

1. 提示条渲染为 `role="status"` 且 `aria-live="polite"`，DOM 中不存在 `role="alert"`。
2. 页面只渲染一条「关闭后不再显示」的一次性提示，`sources.notice.tokenOnceHint`
   键从两个 locale 中移除且键集合保持对等。
3. 「复制 Token」「复制 URL」仍可点击并分别复制 Token 与 Webhook URL，
   Toast 行为不变；「我已保存」仍只通过显式点击关闭提示。
4. 组件测试覆盖角色、`aria-live` 与去重后的文案。
5. `vp fmt --check`、`vp check`、`vp run -r test`、`vp run -r build` 通过；
   浏览器在 1440×900 与 390×844 各复看一次。

## 架构边界

- 改动只在 `features/sources/ui` 的展示层、对应测试与 `i18n/messages/*.json`。
- 不触碰 oRPC contract、service、repository、SQLite schema、auth。
- 无迁移、无新依赖、无环境变量变化；回滚只需还原组件、测试与两个 locale 文件。
