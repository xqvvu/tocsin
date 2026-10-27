# 静默创建成功后的规则确认与直达

- 状态：已实现（对应 backlog `REQ-241`）
- 范围：Tocsin Console 的「一键静默」入口（路由行、通知目标行、事件详情）
- 相关文档：`docs/prd/alert-suppression.md`、`docs/prd/operations-filter-scope.md`

## 问题

运维在值班中从路由行、通知目标行或事件详情点「静默」时，创建成功后弹窗立即关闭，
只留下一条几秒后消失的 toast。操作者无法在同一个位置确认：

- 规则实际叫什么、匹配了什么；
- 静默窗口到什么时间结束、还剩多久；
- 如何回到这条规则复核或调整。

结果是要么凭记忆去 `/suppressions` 列表里翻找，要么重复创建一条规则。对一次
「先止血、稍后复核」的 on-call 操作来说，这两条都不划算。

证据：

- `apps/console/src/features/suppressions/ui/suppression-from-row-dialog-content.tsx`
  的 `handleSubmit` 丢弃 `createSuppression` 的返回值，只调用 `onSaved()` 关闭弹窗。
- `apps/console/src/features/suppressions/ui/suppression-from-event-dialog.tsx`
  同样丢弃返回值并在成功后 `setOpen(false)`。
- `suppressions.create` 契约已经返回完整的 `Suppression`（`packages/api/src/contract/suppressions.ts`），
  包含 `id`、`name`、`startsAt`、`endsAt`，前端不需要新增接口。

## 用户故事

作为值班工程师，我在事件详情或列表行上一键静默后，希望弹窗直接告诉我「规则已创建、
到期时间是什么、还剩多久」，并能一键打开这条规则，这样我可以在继续排障前确认
止血范围，而不是去列表里猜哪条是刚建的。

## 范围

- 路由行、通知目标行共用的 `SuppressionFromRowDialogContent`：保存成功后不再关闭弹窗，
  在表单位置展示成功提示。
- 事件详情的一键静默（指纹、标签值、标题/消息片段）：同样展示成功提示。
- 成功提示内容：
  - 规则名称；
  - 到期时间（按操作者时区格式化）；
  - 剩余时长（复用 `formatDurationMs`；到期/时间不可解析时不显示，不出现负数或 `NaN`）；
  - 「查看规则」链接直达 `/suppressions/$suppressionId`；
  - 「完成」按钮关闭弹窗。
- 失败路径保持不变：弹窗不关闭、表单与已填条件保留，toast 展示错误。
- 新增中英文案键 `suppressions.created.*`。

## 非目标

- 不做静默列表的筛选或顶栏徽标下钻（`REQ-285`）。
- 不做静默窗口续期（`REQ-39` 的续期部分）。
- 不改变 `suppressions.create` 契约、服务端行为、数据库结构或投递语义。
- 不自动跳转到详情页：创建后直接导航会打断「确认范围再继续排障」的节奏，
  因此提供显式链接而不是强制跳转。

## 验收标准

1. 从路由行创建静默成功后，弹窗保持打开并显示：
   - 「静默规则已创建」标题；
   - 规则名称与到期时间；
   - 剩余时长（时钟可注入，测试固定为 1h 30m）；
   - 指向 `/suppressions/<id>` 的「查看规则」链接；
   - 「完成」按钮，点击后关闭弹窗。
2. 从通知目标行创建静默成功后行为一致。
3. 从事件详情（指纹）创建静默成功后行为一致。
4. 创建失败时弹窗保持打开、表单条件保留、不展示成功提示。
5. `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- 纯前端切片：改动集中在 `apps/console/src/features/suppressions/ui/` 与 i18n 文案。
- 不新增 oRPC 过程，不触碰 `server/**`、`infra/**`、`packages/core`。
- 成功提示是 feature 内组件（`suppression-created-notice.tsx`），不复用
  `components/common`，因为它编码的是静默规则这一业务语义。
- 时间格式化复用 `features/operations/model/operation-format` 的纯函数，
  与详情页时间展示保持一致。
