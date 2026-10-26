# 删除预览重试布局、英文分页文案与路由表单原生校验加固

- 状态：已实现（第 123 轮）
- 来源：ui-review 第 121 轮浏览器实测发现 UI-73 / UI-74 / UI-75
- 关联：`apps/console/src/components/common/deletion-impact-notice.tsx`、
  `apps/console/src/i18n/messages/en-US.json`、
  `apps/console/src/features/routes/ui/route-forms.tsx`

## 问题

三个互不相关但同属「运维界面粗糙感」的小缺陷，都有浏览器实测证据：

1. **删除预览失败态挤压正文（UI-73）**：三个删除对话框共用
   `DeletionImpactNotice`，错误分支把「重试」放进 `AlertAction`。该插槽是绝对定位，
   并给告警容器预留 `pr-18`（72px）。在 320px 宽的弹窗里正文只剩约 190px，
   「无法读取删除影响面 / 计数读取失败，仍可继续删除」被折成三行，按钮与文案互相抢空间
   （截图 `/tmp/tocsin-ui-r121/shots/10-source-delete-error.png`、
   `21-mobile-source-delete-error.png`）。
2. **英文分页文案不统一（UI-74）**：`/sources`、`/destinations`、`/integrations`
   显示 `Page 1 / 1`，而 `/routes`、`/deliveries`、`/events`、静默规则显示 `Page 1 of 1`
   （`en-US.json:600,830,1165` vs `:372,1029,1317,1359`）。同一产品的页脚出现两种句式。
3. **路由表单没有 `noValidate`（UI-75）**：`route-forms.tsx:715` 的 `<form>` 未关闭原生
   约束校验。当前能通过只因为名称输入框恰好移除了 `required`
   （`route-forms.tsx:284-287` 有注释说明）。将来任何字段加原生约束，浏览器气泡会重新
   抢在 TanStack Form 的本地化错误之前——这正是 #489 修掉的问题。

## 用户故事

作为值班运维：

- 在窄屏或小窗口删除告警源时，预览读取失败的提示应当完整可读，「重试」不该把正文挤成三行；
- 在英文界面来回切换列表页时，分页页脚应当是同一种句式，而不是一页一个写法；
- 路由表单的校验错误应当始终以本地化文案出现，而不是浏览器的原生气泡。

## 范围

- `deletion-impact-notice.tsx`：错误分支不再使用 `AlertAction`，把「重试」作为
  `AlertDescription` 内的行内动作渲染，`role="alert"` 语义保持不变。
- `en-US.json`：`destinations` / `integrations` / `sources` 三个分页键统一为
  `Page {page} of {pageCount}`。中文文案不变（本来就是 `第 X / Y 页`）。
- `route-forms.tsx`：表单加 `noValidate`；测试断言 `form.noValidate === true`。
- 新增 `apps/console/src/i18n/pagination-labels.test.tsx`，把 8 个分页键放在一起断言，
  避免再次分叉。

## 非目标

- 不改删除预览的请求、加载态、确认门禁与错误语义。
- 不改其他表单（告警源、通知目标、静默规则、设置）的原生校验行为；它们目前仍带
  `required`，是否统一关闭原生校验需要单独的浏览器验证，记入 backlog。
- 不改分页结构、页码计算或 URL 状态。

## 验收标准

- 删除预览失败时，「重试」按钮不再位于 `[data-slot="alert-action"]` 内（结构断言），
  点击仍会触发重新请求；无重试回调时仍然没有按钮。
- 英文界面 8 个分页键渲染结果一致为 `Page 1 of 1`，中文为 `第 1 / 1 页`。
- 路由编辑表单的 `<form>` 元素 `noValidate` 为 `true`，空名称提交仍显示本地化错误且不提交。
- `vp check`、`vp run -r test`、`vp run -r build` 通过；浏览器复看 320px 弹窗无三行挤压。

## 架构边界

纯前端展示与文案改动，不触及 oRPC、service、repository、SQLite、迁移或依赖。
`components/common` 组件仍不读取查询状态、不调用 procedure。
