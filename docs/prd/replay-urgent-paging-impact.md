# 补投预览披露加急电话影响

## 1. 问题

「重新匹配」（补投）会把事件按当前路由重新扇出，创建真实投递并正常执行
（`apps/console/src/server/operations/event-replay.service.ts:53-83`）。投递成功后，
`OncallService.triggerPingsForDelivery` 会按目标的加急配置直接外呼接收人
（`apps/console/src/server/oncall/oncall.service.ts:141-193`）。

但补投预览只告诉操作者「会新建 N 条投递」，没有任何加急电话信息：
`EventReplayPreview` / `RouteReplayPreview` 的 DTO 没有相关字段
（`packages/core/src/operations.ts:423-470`），事件与路由两个确认框也只在确认后
才产生后果（`apps/console/src/features/events/ui/event-replay-action.tsx:135-214`、
`apps/console/src/features/routes/ui/route-replay-prompt.tsx:120-215`）。

故障复盘时一次批量补投可能命中数十条历史告警，每条都向值班人发起加急电话。
投递可以重试、可以查看，电话打出去无法撤回，这是补投唯一不可逆的副作用。

## 2. 用户故事

作为值班 SRE，我在故障复盘时准备补投一批漏发的告警。确认前我需要看到
「这次操作可能会给谁打电话、一共几通」，再决定是否先关闭自动加急或缩小补投范围。

## 3. 范围

- 服务端只读投影：`EventReplayPreview` 与 `RouteReplayPreview` 新增 `urgentPaging`，
  包含涉及的目标、通过全部加急闸门的新投递数、接收人总数上限。
- 闸门只定义一次：`@tocsin/destinations` 的 `feishuUrgentPagingReceivers`
  同时供投递触发与补投预览使用（`packages/destinations/src/feishu/urgent.ts`）。
- 只统计**新投递**：已有投递会被补投跳过；停用的目标不会被 worker 领取，均不计入。
- 事件补投与路由批量补投两个确认框都渲染提示，路由侧按候选事件汇总。
- 中英文案；提示写明这是上限（投递成功且未命中 5 分钟去重窗口才会真正外呼）。

## 4. 非目标

- 不按目标拆分「每条投递」的电话明细，不模拟去重窗口。
- 不新增开关、不自动关闭加急、不阻断补投。
- 不改变投递、路由、加急触发语义；无迁移；不新增 procedure。
- 不覆盖手动「立即呼叫」（`buzzDelivery`），那条路径本身就是人工确认的。

## 5. 验收标准

- 事件补投：全新的 Feishu 应用模式目标（`urgent.autoEnabled=true`、接收人 2 名、
  severity 命中）在预览中显示 `deliveryCount=1`、`receiverCount=2`，并列出目标名。
- 同一事件再次预览（投递已存在）时 `deliveryCount=0`，不渲染提示。
- 停用目标、webhook 模式、已解决（`resolved`）事件、severity 未命中均不产生提示。
- 路由补投：多个候选按目标汇总，`deliveryCount`/`receiverCount` 等于各候选之和。
- 预览不返回接收人 id，只返回人数与目标名；无 secret 进入 DTO。

## 6. 架构边界

- `packages/destinations/src/feishu/urgent.ts`：纯闸门函数（无 IO）。
- `packages/core/src/operations.ts`、`packages/api/src/schemas/operations.ts`：DTO 与契约。
- `apps/console/src/server/operations/event-replay.service.ts`：只读投影，读取目标仓库。
- `apps/console/src/features/operations/ui/replay-urgent-paging-notice.tsx`：展示组件；
  事件与路由两个 feature 复用，文案走 `operations.replayUrgentPaging.*`。
