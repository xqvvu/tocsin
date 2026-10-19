# 手动加急呼叫确认

- 状态：已实现（2026-10-19，自主迭代第 17 轮）
- 相关代码：`apps/console/src/features/deliveries/ui/delivery-buzz-button.tsx`

## 问题

投递详情页的「发起加急」按钮单击即向目标配置的全部加急接收人拨打电话
（`delivery-buzz-button.tsx:44-50` → `oncall.service.ts:79-83`）。这是 console 中影响面最大、
最不可撤销的操作，却没有任何确认步骤；误触会把整组值班人员同时叫醒。与此同时，目标未配置
加急接收人时按钮仍可点击，只有请求返回后才看到错误（`oncall.service.ts:82-84`），
而加急接收人数量其实已在投递详情 DTO 的 `destinationMetadata.urgentReceiverCount`
中可用（`destination.helpers.ts:190-191`）。

## 用户故事

作为值班 SRE，我在投递详情页点击「发起加急」时，希望先看到这次操作会呼叫多少位接收人，
并明确确认后才真正拨号；如果该目标没有配置加急接收人，我希望按钮直接禁用并说明原因，
而不是点击后再失败。

## 范围

- 点击「发起加急」先打开确认对话框，展示接收人数与「立即拨号、不可撤销」的后果说明。
- 确认后才调用 `operations.buzzDelivery`；取消不产生任何请求。
- 用 `DeliveryDetail.destinationMetadata.urgentReceiverCount` 预判可用性：
  为 0 或缺失时按钮禁用，并显示「未配置加急接收人」。
- 保留既有「非飞书应用投递不可加急」的禁用说明。
- 中英文文案补齐。

## 非目标

- 不改变服务端加急语义、去重窗口或接收人解析。
- 不新增 oRPC procedure、DTO 字段或数据库迁移。
- 不在确认框中展示接收人姓名或手机号，只显示人数。
- 不做延迟发送、二次输入或倒计时。

## 验收标准

- [x] 有 Feishu 消息引用且接收人数大于 0 时按钮可用；点击只打开确认框，不发起请求。
- [x] 确认框展示准确接收人数；确认后调用一次 `buzzDelivery`，成功/失败提示与既有行为一致。
- [x] 取消确认框不调用 `buzzDelivery`。
- [x] 接收人数为 0 或缺失时按钮禁用，并显示未配置接收人的说明。
- [x] 非飞书应用投递（`providerReference === null`）保持原有禁用文案。
- [x] 组件测试覆盖确认、取消、无接收人、非应用投递与失败提示分支。

## 架构边界

- 纯前端改动：`features/deliveries/ui/delivery-buzz-button.tsx` 及其测试。
- 复用 `components/ui/alert-dialog`（shadcn primitive）与既有 `useOperationMutations`。
- 不触碰 oRPC 契约、service、repository 或 SQLite。

## 回滚

`git revert` 单个提交即可；无迁移、无数据改写。
