# 路由名称的必填校验改由表单本地化错误呈现

- 状态：已实现（第 119 轮）
- 来源：UI 评审发现 UI-63（第 109 轮首次记录，第 119 轮浏览器与代码复核）
- 关联：`apps/console/src/features/routes/ui/route-forms.tsx`、
  `apps/console/src/features/routes/ui/route-forms.test.tsx`

## 问题

路由名称输入框同时挂着浏览器原生 `required` 与 TanStack Form 的
`onSubmit` 校验（`route-forms.tsx:272-288`）。原生约束会在 submit 事件之前拦截提交，
浏览器用自己的界面语言弹出「请填写此字段」气泡：

- 中文界面下出现的是浏览器语言的气泡，而不是 `routing.form.validation.nameRequired`
  的本地化文案；
- `FieldError` 与 `data-invalid`/`aria-invalid` 样式不会出现，与全站其它表单的错误展示不一致；
- 读屏软件听到的是浏览器的原生提示，而不是页面内与字段关联的错误文本。

第 119 轮浏览器复核时，新建路由的提交按钮因「尚未选择通知目标」而禁用，未能在浏览器里
触发气泡；但属性与提交流程已代码核实，且组件测试可以稳定复现「原生约束抢在本地校验前」。

## 用户故事

作为值班运维，我在新建或编辑路由时，如果名称留空，希望看到与页面语言一致、紧贴字段的
错误提示，而不是浏览器弹出的原生气泡，这样我能确认是哪一个字段、哪一条规则没通过。

## 范围

- 移除名称输入框的原生 `required`，保留 `aria-required`，让读屏仍能获知该字段必填。
- 必填规则仍由现有 `onSubmit` 校验器提供，错误继续通过 `FieldError` 与
  `data-invalid`/`aria-invalid` 呈现。
- 增加组件回归测试：空名称提交时显示 `Route name is required`、不触发保存回调，
  并断言输入框没有 `required`、带有 `aria-required="true"`。
- 不改其它字段、不改提交语义、不改 i18n 文案。

## 非目标

- 不统一改造静默规则等非 TanStack Form 表单的原生 `required`（它们不共享这条校验路径）。
- 不调整路由弹窗宽度（另见 backlog UI-64）。
- 不改 oRPC contract、service、repository、SQLite schema、auth。

## 验收标准

1. 路由新建/编辑表单中，名称留空提交时不再触发浏览器原生校验，改为显示本地化
   `FieldError`，且表单不提交。
2. 名称输入框保留 `aria-required="true"`，读屏仍能识别必填。
3. 新增组件测试覆盖上述行为；既有路由表单测试保持通过。
4. `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- 改动只在 `features/routes/ui` 的展示层与对应组件测试。
- 无迁移、无新依赖、无环境变量变化；回滚只需还原两个文件。
