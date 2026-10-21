# 恢复投递前的加急影响披露

- 状态：已实现（第 66 轮，NEW-AG）
- 相关代码：`apps/console/src/features/configuration/ui/delivery-resume-dialog.tsx`、
  `apps/console/src/features/deliveries/ui/deliveries-paused-notice.tsx`、
  `apps/console/src/features/configuration/ui/settings-delivery-pause-panel.tsx`、
  `apps/console/src/server/deliveries/delivery-execution.ts`、
  `apps/console/src/server/oncall/oncall.service.ts`

## 问题

全局暂停只停止投递 Worker 领取任务（`delivery-worker.service.ts:60-76`），
但恢复时有两个容易被忽略的后果：

1. **排队投递会集中发送**。Worker 每 5 秒轮询一次
   （`delivery-worker-runner.ts:50`），恢复后队列里的旧告警会在几秒内全部发出。
2. **旧告警可能再次打电话**。app 模式飞书投递发送成功后，会按目标配置触发自动加急
   （`delivery-execution.ts:119-130`）；门控只要求事件在入库时是 firing、严重度命中
   （`oncall.service.ts:147-160`），去重窗口仅 5 分钟（`oncall.service.ts:18`）。
   因此暂停数小时后恢复，会把暂停期间累积的 firing 告警重新变成一轮电话。

现有两个恢复入口都只写「恢复后继续发送」（`deliveries-paused-notice.tsx:30-35`、
`settings-delivery-pause-panel.tsx:44-47`），且点一下立即生效（Settings 的勾选框），
没有任何确认或加急影响说明。

同时，暂停**不影响**加急呼叫：手动加急与已排队的 ping 仍由 on-call runner 执行
（`container.ts:378-380`；`deliveryPaused` 只在 Delivery Worker 中被读取）。
暂停界面也没有说明这一点，值班工程师容易误以为「暂停 = 不打电话」。

## 用户故事

作为值班 SRE，我在恢复出站投递前能看清「排队投递会立即发送、仍处于触发中的告警会重新
呼叫接收人」，并且必须显式确认才会恢复；在暂停期间我也能看到「加急呼叫仍在继续」，
不会把暂停误当成全局静默。

## 范围

- 新增共享确认对话框 `DeliveryResumeDialog`：
  - 标题「恢复出站投递？」；
  - 说明排队投递会立即领取并发送；
  - 以警示色说明飞书应用模式 + 自动加急的目标会对仍处于触发中的告警重新呼叫接收人，
    暂停越久电话越集中；
  - 「暂不恢复」/「恢复并发送」两个动作；提交中禁用；成功后关闭并发
    `deliveries.paused.resumed` toast，失败保留对话框并提示错误。
- Deliveries 页暂停横幅的「恢复投递」按钮改为先打开该对话框。
- Settings 暂停面板：暂停仍为单击立即生效；取消勾选（恢复）改为打开同一对话框，
  取消则保持暂停。
- 暂停态文案补充「加急呼叫不受暂停影响」：
  `configuration.deliveryPause.toggleDescription`、`deliveries.paused.description`、
  `deliveries.paused.descriptionNoTime`。
- 中英文案同步新增 `deliveries.resumeDialog.*` 键。

## 非目标

- 不改变暂停/恢复的服务端语义，不新增 oRPC procedure 或 contract 字段。
- 不做「排队投递数量」「受影响目标列表」等服务端统计（需要新 DTO，留待后续）。
- 不阻止或延迟恢复后的加急呼叫，不调整去重窗口。
- 不把加急 runner 纳入暂停开关。
- 不改 Settings 偏好表单的保存语义。

## 验收标准

- 暂停时点击 Deliveries 横幅的「恢复投递」，先出现确认对话框；未确认前不调用
  `settings.update`。
- Settings 暂停面板取消勾选后出现同一对话框；选择「暂不恢复」不发起请求，勾选状态
  保持暂停。
- 确认后调用 `settings.update`，参数为 `{ rawPayloadRetentionDays, deliveryPaused: false }`，
  成功后关闭对话框并提示「已恢复出站投递」。
- 提交失败时对话框保持打开，提示「恢复投递失败」与错误详情。
- 暂停态横幅与 Settings 说明均包含「加急呼叫不受暂停影响」。
- 组件测试覆盖：横幅确认前不提交、确认后提交、失败保留对话框；Settings 暂停无需确认、
  恢复需确认、确认后提交。
- `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- 纯前端切片：新增 `features/configuration/ui/delivery-resume-dialog.tsx`，
  修改两个既有入口组件与 i18n 文案。
- 复用 `useAppSettingsMutation` 与 `appSettingsQueryOptions`，不新增查询键、不改缓存策略。
- 无迁移、无 contract 变化、无服务端改动、无新依赖。
- 对话框不读取 URL 状态，不引入全局状态库。
