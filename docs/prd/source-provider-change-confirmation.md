# 切换告警源解析器前确认影响范围

## 背景

编辑告警源时，解析器（Provider）下拉始终可改，保存即生效，没有任何提示
（`apps/console/src/features/sources/ui/source-form.tsx:128-163`、
`apps/console/src/features/sources/ui/edit-source-form.tsx:42-53`、
`apps/console/src/server/sources/source.service.ts:52-64`）。

解析器决定每条后续 Webhook 如何被标准化成 Tocsin 的告警字段。切换后：

- 服务端直接写入新的 `provider`，历史 Event 不会重新解析，保留旧解析结果；
- 之后到达的载荷按新解析器解析，结构不匹配时整条告警会在接入阶段被拒绝，只留下一条
  「解析失败」的 Event，不产生任何投递（
  `apps/console/src/server/intake/intake.service.ts:192-240`）。

也就是说，一次没有提示的下拉切换可能让整条接入链路静默失效：上游仍在发送，事件列表里
只剩解析失败，值班人员要过一段时间才会发现。仓库里同类的语义变更——停用告警源、
轮换接入 Token、启用路由、重新启用通知目标——都已经有确认框
（`source-actions.tsx:100-190`、`routes-section.tsx:339-354`、
`destination-actions.tsx:196-244`），只有解析器切换是裸保存。

## 用户故事

作为一名值班 SRE，在编辑一个正在接收生产告警的告警源、准备把解析器从 Grafana 换成
另一个类型时，我希望保存前看到「旧解析器 → 新解析器」和影响范围，这样我能确认这不是
一次误点，并知道历史事件不会被重新解析、不匹配的载荷会被拒绝。

## 范围

1. 编辑表单（`SourceForm` 收到 `onCancel` 的编辑分支）在提交时比较当前解析器与初始
   解析器，不同则拦截提交并弹出 `AlertDialog`。
2. 确认框内容：标题「切换告警解析器？」、描述说明旧 → 新与两条影响（历史不重解析、
   不匹配载荷被拒绝并记为解析失败）、取消「保留当前解析器」、确认「切换解析器」。
3. 确认后沿用原有提交路径：同一份表单值、同一次 `onSubmit` 调用，不新增接口。
4. 取消或关闭确认框时不提交，表单值保留，可以继续编辑或改回原解析器再保存。
5. 新建告警源没有「旧解析器」，流程不变，不触发确认。
6. 文档站 `apps/docs/guide/sources.md` 的「编辑解析器或共享密钥」补充确认框口径。

## 非目标

- 不做解析器预览、自动探测或历史事件重解析（REQ-211）。
- 不限制解析器切换，不引入服务端校验或状态机。
- 不改变 `source.service.ts` 的更新语义、DTO 或 oRPC 契约。
- 不为名称、共享密钥等其他字段增加确认。

## 验收标准

- 编辑已有告警源、解析器未变时，点击保存直接提交，不出现确认框。
- 编辑已有告警源、解析器变化时，点击保存先出现确认框，且不调用 `onSubmit`。
- 确认框显示旧解析器与新解析器的本地化名称。
- 点击确认后调用一次 `onSubmit`，参数中的 `provider` 是新值。
- 点击取消或关闭确认框后不调用 `onSubmit`；改回原解析器再保存仍直接提交。
- 新建告警源时切换解析器并保存，不出现确认框。
- 两个语言文件的键保持齐平；`vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

纯前端切片：`features/sources/ui`、i18n 文案与文档站页面。无 oRPC 契约、service、
repository、数据库 schema、迁移或依赖改动；确认框复用既有 `components/ui/alert-dialog`
原语，提交仍走 `useSourceMutations().updateSource` 与现有失效逻辑。
