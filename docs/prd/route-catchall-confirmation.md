# 路由全空条件保存护栏

## 状态

已实现，2026-10-19（backlog `REQ-57`）。

## 问题

路由规则的所有条件类（告警源、严重级别、状态、标签、标题包含、消息包含）都为空时，
匹配器会把每一条告警都视为命中。这是合法且有意义的配置（例如把所有告警转发到一个
审计目标），但当前表单在保存时没有任何提示：

- 新建路由默认带 `severities: ["critical"]`，但操作者可以逐行删除；
- 编辑已有路由时可以把所有条件删光；
- 空规则保存后，路由列表和详情只显示「无条件」，值班人员很难意识到这是一条
  catch-all 规则。

抑制表单已经对「空 matcher 会静默所有告警」做了确认对话框
（`apps/console/src/features/suppressions/ui/suppression-forms.tsx`），路由缺少
同类护栏，两个高危配置面的交互不一致。

## 用户故事

作为值班 SRE，我希望在保存一条没有任何条件的路由前看到明确的 catch-all 影响提示，
以便确认自己不是误删了全部条件，也避免把某类告警意外投递到错误的目标。

## 范围

- `apps/console/src/features/routes/model/route-form.ts` 新增 `routeRuleIsEmpty`：
  按「保存后的规则」判定是否为空，复用 `routeRuleFromValues` 的归一化语义
  （空白字符串、半填写的标签行都不算条件）。
- `apps/console/src/features/routes/ui/route-forms.tsx` 在表单提交时拦截空规则，
  弹出确认对话框；确认后保存拦截前已经通过校验的表单值，取消则不提交。
- 新建与编辑路由共用该表单，因此两条路径同时生效。
- 中英文文案：标题、说明、取消、确认四个键。

## 非目标

- 不禁止保存空规则（catch-all 是合法配置）。
- 不改变路由匹配、投递或去重语义。
- 不新增 oRPC procedure、service、repository 或数据库字段。
- 不改造路由列表的「无条件」展示（另见 `REQ-54`、`REQ-67`）。
- 不做路由复制、模板或预设（另见 `REQ-68`）。

## 验收标准

- 空规则保存时出现确认对话框，确认前 `onSubmit` 不被调用。
- 确认后提交的规则与表单值一致（仍为空规则），并带上名称与目标。
- 取消后对话框关闭且不提交。
- 任一条件类非空（包括只有空白字符串以外的有效值）时不出现对话框，直接保存。
- 只有空白字符串或半填写标签行时，按归一化后的空规则处理，仍出现确认。
- 既有「多条件规则原样往返」测试保持不变。
- `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- 纯前端 feature 改动：`features/routes/model` + `features/routes/ui` + i18n。
- 不触碰 oRPC contract、service、repository、SQLite schema、secret、auth 或投递语义。
- 判定逻辑放在 model 层，表单只负责交互；确认对话框复用 shadcn `AlertDialog`。
