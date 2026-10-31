# 通用 Webhook 目标可选发送 Idempotency-Key

## 问题

Tocsin 的投递是「至少一次」语义：出站请求在超时、连接中断或进程退出时，Tocsin 无法确认目标是否已经处理。自动重试或手动重试会把同一个 Event 再发一次，接收端通常只能靠自己按 `eventId` 去重。

通用 Webhook 目标此前没有任何机器可读的「这是同一次投递」信号：请求只带固定的 `Content-Type` 和运营者配置的 Header。接收端若要区分「重试」与「新告警」，只能依赖请求体里的 `eventId`；使用 `json_payload` 自定义模板时连默认信封都可能被替换，缺少稳定标识。

## 用户故事

作为自建接收端（内部事件总线、自动化平台）的运维者，我希望为通用 Webhook 目标显式开启一个稳定的 `Idempotency-Key` 请求头，这样当 Tocsin 因超时重试同一条投递时，我的接收端可以丢弃重复请求，而不是重复执行自动化动作或重复通知。

## 范围

- 通用 Webhook 配置新增可选布尔字段 `idempotencyKey`，默认关闭，并出现在目标编辑表单、适配器清单与配置导入导出中。
- 开启后，真实投递携带 `Idempotency-Key: <deliveryId>`。`deliveryId` 是同一条投递在多次重试之间的稳定标识。
- 预览与「测试」发送没有持久化投递，不发送该请求头。
- 运营者在 `headers` 中显式配置同名 Header 时，以运营者配置为准。
- 中文、英文控制台文案与运行时文档同步。

## 非目标

- 不改变投递、路由或静默的核心语义；不引入跨投递去重。
- 不为 Slack、飞书或邮件目标添加幂等头。
- 不做 HMAC/签名，不校验接收端是否真的实现了去重。
- 不修改投递重试次数、退避或失败分类。

## 验收标准

- 开启后，适配器发送的请求头包含 `Idempotency-Key`，值等于传入的投递 ID。
- 未开启时，即使存在投递 ID 也不发送该头。
- 开启但输入没有投递 ID（预览/测试）时，不发送该头。
- 运营者显式配置同名 Header 时，运营者值覆盖自动值。
- 投递执行器把 `delivery.job.id` 作为 `deliveryId` 传给适配器。
- 编辑器草稿能读出已保存的开关；旧配置（没有该字段）按关闭处理。
- 表单创建与编辑都能写入开关值，编辑时显式关闭可以生效。
- 两个语言的清单文案都存在，适配器目录审计无警告。
- `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- 配置 schema、清单与发送逻辑属于 `packages/destinations` 的通用 Webhook 适配器。
- 渲染输入新增可选 `deliveryId`；预览与测试调用方不传，保持既有行为。
- 投递执行器（`apps/console/src/server/deliveries/delivery-execution.ts`）负责从已领取的投递填充 `deliveryId`。
- 控制台表单、编辑器草稿与 i18n 文案属于 `apps/console` 的 Destinations feature。
- 无数据库迁移：开关保存在既有目标配置 JSON 中。
