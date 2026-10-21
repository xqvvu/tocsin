# 通知目标测试发送选择真实历史事件

## 问题

通知目标列表的「测试」动作固定使用内置合成事件，只能验证凭证是否可用，无法验证
真实模板字段与消息格式：

- `testDestination` 始终调用 `createTestNormalizedEvent()`，事件标题固定为
  `Tocsin destination test`、严重程度固定为 `info`
  （`apps/console/src/server/destinations/destination.service.ts:153-194`）。
- 内置样例没有原始载荷，`{{payload.*}}` 模板变量无法用真实数据验证；
  渲染输入也没有传入控制台时区与语言，测试消息的日期格式可能与真实投递不同
  （`apps/console/src/server/destinations/destination.service.ts:171-183`）。
- 预览已经支持选择最近 20 条历史事件（`resolvePreviewSample`、
  `apps/console/src/features/destinations/ui/destination-notices.tsx:74-110`），
  但同一份样例无法用于真正的测试发送。
- 测试发送目前一键直达下游系统，没有确认步骤（backlog REQ-182 同时记录了这一缺口）。

值班工程师因此常在「测试通过」之后，仍然在真实告警里发现模板字段为空或格式错误。

## 用户故事

作为值班 SRE，我希望在发送测试前选择一条真实历史事件，并先看到本次将向哪个目标
发送，这样测试消息能复现真实告警的标题、指纹、原始载荷与时间格式，而不是只证明
凭证有效。

## 范围

- `TestDestinationCommandSchema` 新增可选 `sampleEventId`；不传时保持现有内置样例行为。
- `DestinationService.testDestination` 复用 `resolvePreviewSample`：
  - 选择历史事件时，使用该事件的 `normalizedEvent`、告警源、事件 ID 与**已脱敏**的
    `rawPayload` 渲染并发送。
  - 同时传入控制台设置的语言与时区，使测试消息与真实投递使用同一套展示格式。
  - 事件不存在时返回 `RecordNotFoundError`（与预览一致）。
- 「测试」动作改为确认对话框：展示目标名称、样例选择器（内置样例 / 最近历史事件）、
  发送与取消按钮；发送中禁用按钮，成功后关闭对话框并沿用现有 toast 展示结果，
  失败时保持对话框打开以便重试。
- 历史事件样例列表复用 `recentEventsQueryOptions()`，仅在对话框打开时加载。

## 非目标

- 不写入 `events` 或 `deliveries`，不经过路由匹配与投递 worker。
- 不改变 `DestinationTestResult` 契约或脱敏投影规则。
- 不改变预览行为、样例选择器的既有文案与加载逻辑。
- 不新增依赖、迁移或公开 API。

## 验收标准

1. 不传 `sampleEventId` 时，测试请求体与现状一致（`eventId` 以 `test-` 开头，
   使用内置合成事件）。
2. 传 `sampleEventId` 时，请求体的 `eventId`、`alert`（归一化事件）、`source`
   来自该历史事件；`{{payload.*}}` 取到真实载荷且凭据字段已脱敏。
3. 测试渲染使用控制台设置的语言与时区（`{{presentation.locale}}` /
   `{{presentation.timeZone}}` 可验证）。
4. 事件不存在时测试调用失败，且不向下游发送请求。
5. 对话框默认选择内置样例；选择历史事件后发送时携带对应事件 ID；
   发送未完成（返回 `null`）时对话框不关闭。
6. `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- 契约：`packages/core/src/configuration/configuration-commands.ts`（新增可选字段）。
- 服务：`apps/console/src/server/destinations/destination.service.ts`（复用私有样例解析）。
- 前端：`apps/console/src/features/destinations/ui/destination-test-dialog.tsx`（新增）、
  `destinations-page.tsx`（接线）、i18n 文案。
- 不涉及 schema/迁移、投递/路由/auth 语义；oRPC 路由与 output 契约不变。
