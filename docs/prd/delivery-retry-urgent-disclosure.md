# 投递重试统一确认并披露自动加急呼叫

## 问题

同一个「重试投递」动作在控制台里有三个入口、两种行为：

| 入口 | 是否有确认 | 是否说明会打电话 |
|---|---|---|
| 投递列表行内按钮（`features/deliveries/ui/delivery-retry-action.tsx`） | 有，只说目标与 `attempt/max` | 不说 |
| 投递详情页按钮（`delivery-detail-page.tsx:67-73` → `delivery-retry-button.tsx`） | **无**，单击即重试 | 不说 |
| 事件详情页投递表按钮（`event-detail-deliveries-table.tsx:113-119`） | **无**，单击即重试 | 不说 |

而重试并不只是「再发一条消息」：投递被重置为 `pending`
（`server/operations/operations.service.ts:179-181` → `delivery.repository.ts`
的 `retryNow`），worker 发送成功后会调用 `triggerPings`
（`server/deliveries/delivery-execution.ts:179-183`），门槛的唯一实现是
`packages/destinations/src/feishu/urgent.ts:19-47`（飞书 app 模式 + 自动加急开启 +
严重程度命中）。一次成功重试可能给多个值班接收人拨打**不可撤销**的电话，文档
已明确这一点（`apps/docs/integrations/feishu-app.md:99`：「电话不可撤销」）。

后果：详情页与事件详情页的「一键重试」在自动加急开启时，会在没有任何警告的情况下
把电话打出去；即使有确认的列表入口，也没有说明这一后果。

## 用户故事

作为值班 SRE，我在排障时点「重试投递」，希望在任何入口都先看到同样的确认，并在
目标配置了自动加急时看到**这次重试可能拨打多少人、打到哪个目标**，这样我不会因为
「重发一条消息」的直觉而误触发一轮电话呼叫。

## 范围

- `@tocsin/core`：把 `ReplayUrgentPagingImpact` / `ReplayUrgentPagingDestination`
  改名为 `UrgentPagingImpact` / `UrgentPagingDestination`（补投与重试共用同一形状），
  新增只读 `DeliveryRetryPreview { deliveryId, urgentPaging }`。
- `@tocsin/api`：`UrgentPagingImpactSchema` / `UrgentPagingDestinationSchema` 同步改名，
  新增 `DeliveryRetryPreviewSchema` 与 `operations.previewDeliveryRetry`（只读，
  `output(...nullable())`，与两个补投预览一致）。
- `DeliveryRepository` 暴露 `getJob(id)`（实现已存在，只是未进接口），供预览只读
  读取投递本身，而不必装配整份 `DeliveryDetail`。
- `OperationsService.previewDeliveryRetry`：复用 `feishuUrgentPagingReceivers`，
  并按 `claimNext` 的同一谓词排除「目标停用 / 路由停用」——这类投递永远不会被领取，
  因此不会外呼。
- UI：抽出共享确认体 `DeliveryRetryConfirmContent`，三个入口统一使用；确认体在打开时
  读取 `previewDeliveryRetry`，命中时渲染 `UrgentPagingNotice`（原
  `ReplayUrgentPagingNotice` 泛化为 `action: "replay" | "retry"`）。
- 文案：`deliveries.table.retryConfirm.*` 迁到中性的 `deliveries.retry.confirm.*`；
  `operations.replayUrgentPaging.*` 迁到 `operations.urgentPaging.*`，并新增
  `retryTitle`。

## 非目标

- 不改变重试、退避、去重、加急门槛的任何语义；不新增投递状态。
- 不做批量重试，不改补投（replay）的确认逻辑。
- 不返回接收人 ID 或姓名，只给「目标 × 人数」的上界。
- 不在预览里判定静默规则：静默在领取时解析，这里按「宁可多提醒」处理（见下）。
- 不新增 schema 或迁移。

## 验收标准

- 三个入口点击后都不直接重试，必须先确认；取消后不产生任何写操作。
- `previewDeliveryRetry`：
  - 投递不存在 → `null`；
  - 目标停用或路由停用 → `urgentPaging` 为空投影（`deliveryCount: 0`）；
  - 目标为飞书 app 模式、自动加急开启且严重程度命中 → 返回目标名与接收人数
    （`deliveryCount: 1`）；
  - 其他情况（webhook 模式、自动加急关闭、严重程度不命中、事件非 firing）→ 空投影。
- 确认对话框在 `receiverCount > 0` 时显示加急提示，`receiverCount` 为 0 时完全不渲染
  该提示，且预览读取失败不阻塞重试（与排队投递计数一致）。
- 中英文 i18n 键保持 parity；只读接口不返回任何 secret。
- 服务单测覆盖上述三分支；组件测试覆盖「必须确认」「提示出现 / 不出现」「取消不重试」。

## 架构边界

- 契约在 `packages/core/src/operations.ts` 与 `packages/api/src/schemas/operations.ts`，
  保持环境无关；服务在既有 `OperationsService` 内，不新增 service、不引入 DI。
- 只读路径复用 `@tocsin/destinations/feishu` 的 `feishuUrgentPagingReceivers`，
  与 worker、补投预览共用同一门槛实现，避免第二套判定。
- UI 复用现有 shadcn `AlertDialog` 与既有 `UrgentPagingNotice`，不新增视觉系统；
  确认体放在 `features/deliveries/ui`，跨 feature 复用沿用
  `QueuedDeliveriesNotice` 的先例。
- 已知误导方向：静默在领取时判定，预览不做该判定，因此在静默窗口内可能提示「可能外呼」
  而实际不会——这是安全方向（多提醒而非少提醒），与补投预览现状一致。
