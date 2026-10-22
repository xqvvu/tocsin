# 暂停期间补投与目标测试的时机提示

## 问题

出站投递暂停期间，运维仍能触发补投、重试和目标测试，但界面不说明这些动作在暂停下会发生什么：

- 事件详情的「重新匹配」和路由列表的「预览历史匹配」只创建投递；暂停时邮只会入队，恢复后才发送（`apps/console/src/features/events/ui/event-replay-action.tsx`、`apps/console/src/features/routes/ui/route-replay-prompt.tsx`）。
- 通知目标的「测试」绕过 delivery worker，直接调用 adapter 真实发送，暂停不会阻止它（`apps/console/src/server/destinations/destination.service.ts` 的 test 路径）。

结果是两种相反的误解：补投后以为已经发出，或者以为暂停能拦住测试消息。两者都会在事故处理中造成错误判断。

## 用户故事

作为值班运维，在出站投递暂停时：

- 我打开补投确认框，能立刻知道这些投递只会入队、需要恢复后才发送。
- 我打开目标测试确认框，能立刻知道测试消息会绕过暂停立即真实发送。

## 范围

- 新增共享提示组件 `DeliveryPauseHint`，读取现有 `appSettingsQueryOptions`，仅在 `deliveryPaused` 时渲染。
- 两种文案：`queued`（补投/重试入队）与 `immediate`（目标测试立即发送，使用 destructive 强调）。
- 接入事件补投确认框、路由历史匹配确认框、通知目标测试确认框。
- 未暂停时不渲染任何内容，不改变任何动作语义。
- 中英文案同步。

## 非目标

- 不阻止、不确认、不排队目标测试；只披露。
- 不改变补投/重试的入队与去重语义。
- 不新增接口、迁移或轮询；暂停状态复用顶栏暂停徽标已经预取的查询。

## 验收标准

- [x] 暂停时事件补投框显示「只会先入队，恢复投递后才会发送」。
- [x] 暂停时路由历史匹配框显示同一提示。
- [x] 暂停时目标测试框显示「会绕过队列立即真实发送」，颜色为 destructive。
- [x] 恢复投递后三处提示消失，不留下空行。
- [x] 提示查询失败或加载中时不阻塞对话框，也不显示错误。
- [x] 中英文案齐全；组件测试覆盖 queued / immediate / 未暂停三态。

## 架构边界

- 提示只读共享的 app settings 查询，不直接访问服务端模块。
- 组件放在 `features/configuration/ui/`，与暂停状态所有者一致；补投与目标页面按既有跨 feature 组件导入方式复用。
- 无 schema、迁移、依赖或投递语义变化。
