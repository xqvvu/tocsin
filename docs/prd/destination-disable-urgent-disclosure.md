# 停用通知目标时披露自动加急影响

状态：已实现（第 41 轮，对应 backlog REQ-170）

## 问题

通知目标（Destination）的停用确认框只说明路由投递与排队投递的影响：

- `apps/console/src/features/destinations/ui/destination-actions.tsx:124-136` 只渲染
  `destinations.disable.confirmDescription*`。
- `apps/console/src/i18n/messages/zh-Hans.json:281-282` 的文案是「已启用路由将不再投递，
  已排队但尚未发送的投递会暂停」。

但飞书目标的「自动加急」是独立的电话呼叫通道：只要目标启用且规则命中严重程度，
Tocsin 会在投递时自动拨打 `urgentReceivers`（`packages/core/src/destination/destination.ts:52-55`）。
停用目标会让这条通道一起停掉，操作员在确认框里看不到任何提示，容易误以为只是「暂停普通消息」。

告警静默表单已经对同类影响做了显式披露
（`apps/console/src/features/suppressions/ui/urgent-impact-preview.tsx:39-58`），停用确认框
是缺失的一环。

## 用户故事

作为一名值班 SRE，我在停用一个开启了自动加急的通知目标时，希望确认框明确告诉我
「停用后命中加急条件的告警不再拨打电话」，并显示受影响的呼叫对象数量，
这样我不会在不知情的情况下关掉整个电话告警通道。

## 范围

- `DestinationActions` 停用确认框：当 `operationalConfig.urgentAutoEnabled === true` 时，
  在原有描述下方追加一条 destructive 警示：
  - 标题说明「停用后自动加急也会停止」。
  - 有呼叫对象时显示「{count} 个呼叫对象将收不到呼叫」；没有解析出呼叫对象时使用
    不含数量的文案。
- 新增中英文 i18n 键：`destinations.disable.urgentAutoTitle`、
  `destinations.disable.urgentAutoDescription`、
  `destinations.disable.urgentAutoDescriptionNoReceivers`。
- 测试覆盖：开启自动加急的目标显示警示与人数；关闭自动加急的目标不显示警示。

## 非目标

- 不改变停用语义：停用仍然只切换 `enabled`，不级联修改路由、静默规则或加急配置。
- 不拦截或要求二次确认「自动加急确实会停」，提示即可。
- 不在列表页或启用动作上增加类似提示（列表已通过「自动加急 · N 人」展示配置，
  `destination-operational-config-cell.tsx:65-70`）。
- 不新增 oRPC 过程、DTO 字段、迁移或依赖。

## 验收标准

- 对 `urgentAutoEnabled === true` 且有两个呼叫对象的目标打开停用确认框，能看到
  「停用后自动加急也会停止」和「2 个呼叫对象将收不到呼叫」。
- 对 `urgentAutoEnabled` 为 `false` 或 `null` 的目标，确认框不出现该警示。
- 中英文文案均无句末标点，符合既有 i18n 约定。
- `vp check`、`vp run -r test` 通过。

## 架构边界

- 纯前端切片：`features/destinations/ui/destination-actions.tsx` 与两份 i18n 消息文件。
- 数据来自既有 `DestinationListItem.operationalConfig`
  （`packages/core/src/destination/destination.ts:52-55`），不新增服务端字段。
- 复用 `components/ui/alert` 的 `destructive` 变体，与静默表单的加急影响面板保持同一视觉语言。
