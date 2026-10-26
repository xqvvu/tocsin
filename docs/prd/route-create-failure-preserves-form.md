# 新建路由失败时保留弹窗与已填内容

- 状态：已实现（第 107 轮）
- 来源：UI 评审发现 UI-53（`docs/planning/iteration-backlog.md`）
- 关联：`apps/console/src/features/routes/ui/route-add-dialog.tsx`、`route-forms.tsx`、`routes-page.tsx`

## 问题

新建路由弹窗在**请求发出前**就关闭，并把表单重置：

- `route-add-dialog.tsx` 的 `onSubmit` 只调用上级回调，随后立即 `setOpen(false)`。
- `route-forms.tsx` 的 `RouteForm` 在 `resetOnSubmit` 时同步调用 `form.reset()`。
- 请求失败后由 `routes-page.tsx` 事后 toast 报错。

结果是保存失败（网络错误、服务端校验失败、路由名冲突等）时，运维已经输入的整份条件
（告警源、严重级别、标签、标题/消息包含、通知目标）全部丢失，只能从头再填。这与告警源
新建弹窗「成功后才关闭」的行为不一致。

## 用户故事

作为值班运维，我在新建一条包含多个条件的路由规则时，如果保存失败，我希望弹窗保持打开、
已填条件原样保留、错误明确提示，这样我可以修正后直接重试，而不必重新录入整条规则。

## 范围

- `CreateRouteForm` / `RouteForm` 的提交回调可以返回「是否成功」（`boolean` 或
  `Promise<boolean>`）；只有成功（返回值不是 `false`）才重置表单。
- `RouteAddDialog` 只在保存成功后关闭；失败时保持打开。
- `routes-page.tsx` 的 `onCreate` 返回保存结果：`submitAction` 返回 `null`（失败）时为
  `false`，成功时继续触发既有的路由重放提示。
- 新增组件测试覆盖「失败保留 / 成功关闭」两条路径。

## 非目标

- 不改变编辑路由表单的保存语义（编辑表单不做 `resetOnSubmit`）。
- 不改变失败 toast 的文案与位置。
- 不引入新的表单状态库或全局状态。
- 不改变路由规则 schema、oRPC 契约或服务端行为。

## 验收标准

1. 新建路由保存失败时：弹窗仍打开，名称与全部条件保持已填值，不触发 `form.reset()`。
2. 新建路由保存成功时：弹窗关闭，表单重置。
3. 既有 `route-forms` 测试（多条件往返、校验、空规则确认）保持通过。
4. `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- 改动只在 `features/routes/ui` 的展示与交互层，以及页面级提交回调的类型签名。
- 不触碰 oRPC contract、service、repository、SQLite schema 或 auth。
- 无迁移、无新依赖、无环境变量变化；回滚只需还原前端文件。
