---
title: 通知目标验收与失败判读
description: 按通用 Webhook、Slack、邮件网关、飞书机器人 Webhook 和飞书应用验证通知目标，并区分目标测试、真实投递与最终送达。
---

# 通知目标验收与失败判读

这页用于在通知目标接入值班链路前，验证配置、模板、网络与目标响应。它不能代替完整路由验收：目标测试成功只证明这一次调用被接收，真实通知仍取决于 Route、静默、启停状态、队列和 Worker。

先阅读[通知目标参考](/integrations/destinations)了解字段与模板，再使用本页完成隔离测试和证据记录。邮件网关还需要先满足[邮件网关接入与验收](/integrations/email-gateway)中的接口与发件域前提；飞书应用和电话加急的完整边界见[飞书应用与电话加急](/integrations/feishu-app)。

::: warning 使用隔离接收端
先使用测试频道、测试收件人或自建接收端。通知目标的「测试」会立即向真实下游发送消息，并绕过投递队列与全局暂停；不要把首个调试消息直接发到生产值班群，也不要在工单或聊天中粘贴完整 Webhook、Token 或 Header。
:::

## 三层验收边界

| 层次 | 会访问下游 | 创建 Event / Delivery | 能证明 | 不能证明 |
| --- | --- | --- | --- | --- |
| Preview | 否 | 否 | 当前配置能渲染，模板变量与最终载荷结构符合预期 | URL、凭证、网络或目标权限 |
| Test | 是 | 否 | 这一次发送的凭证、网络、模板和目标接受规则可用 | Route 会命中、目标已启用、Worker 正常、电话加急会触发 |
| 真实投递 | 是 | 是 | 完整链路产生 Delivery，并记录尝试、响应、回执与重试 | 外部系统的最终人工可见送达 |

Preview 默认使用内置合成样例；选择历史 Event 后，才会带入真实规范化字段、已脱敏原始载荷和可用的 `tocsin.eventUrl`。Test 也支持历史 Event，但测试结果不会生成可再次搜索的 Delivery。

## 类型验收矩阵

| 目标类型 | 验收前检查 | 成功判定与回执 |
| --- | --- | --- |
| 通用 Webhook | URL、`POST`/`PUT`/`PATCH`、Header、接收端 JSON 契约；`text` 或 `json_payload` 模板 | 任意 HTTP `2xx`；响应体只作为证据，无目标回执。接收端应自行记录请求 ID |
| Slack | Incoming Webhook、目标频道、Block Kit 结构；`text` 或 `slack_blocks` 模板 | HTTP `2xx` 且去空白后的响应体为 `ok`；无消息回执 |
| 邮件 | 网关地址、认证 Header、收件人、发件人；内置内容、`subjectTemplate`、`text`、`htmlTemplate` | 任意 HTTP `2xx` 表示网关接受请求；不解析电子邮件 ID |
| 飞书机器人 Webhook | Webhook URL、可选签名密钥、群机器人；内置卡片、`text`、`feishu_card` 模板 | HTTP `2xx`；可解析响应还要求业务成功标记，无应用消息句柄 |
| 飞书应用 | 已登记应用、`chat_id`、群与权限、呼叫对象；内置卡片、`text`、`feishu_card` 模板 | HTTP `2xx` 且业务码为 `0`；`data.message_id` 缺失时不可加急 |

上表中的“成功”是 Tocsin 记录 `succeeded` 的边界，不等同于邮件最终投递、Slack 用户已读或通用 Webhook 下游业务处理完成。

## 通用 Webhook

先用一个由你控制的临时接收端记录请求方法、Header、请求体、到达时间和 `eventId`，再执行目标 Preview 与 Test。接收端应返回明确的 `2xx`，不要只在浏览器中看到地址可打开。

验收时逐项核对：

1. `method` 与接收端路由一致；默认是 `POST`，也允许 `PUT` 或 `PATCH`。
2. `text` 模式仍保留默认信封，只替换 `message`；`json_payload` 模式会替换整个请求体。
3. 自定义 JSON 中的变量只写在字符串值里；未知变量或 `headers.*`、`config.url` 一类 secret 路径应在发送前报配置错误。
4. 接收端能按 `eventId` 或 `eventId + destination.id` 去重；`json_payload` 模式必须自行保留所需的事件标识。
5. `204 No Content` 可视为成功；发送后，在真实 Delivery 的尝试记录中核对 HTTP 状态与已脱敏响应。

HTTP `408`、`409`、`425`、`429`、`5xx`、连接错误与超时会进入自动重试；其他 `4xx` 通常不可重试。接收端可能已经处理请求后才超时，因此“至少一次”投递可能产生重复请求。

## Slack

在 Slack 管理页面确认 Incoming Webhook 仍指向预期频道、集成未被移除、频道没有归档。Tocsin 通过目标中保存的 `webhookUrl` 发送消息，不需要浏览器登录 Session。

验收时逐项核对：

1. 默认 `text` 模式仍生成 Block Kit 消息，只替换正文；`slack_blocks` 模式必须提供 JSON 对象根，典型对象包含 `text` 与 `blocks`。
2. Preview 检查 header、section、字段数量和 Block Kit 类型；不要用数组作为模板根。
3. Test 后，确认频道收到消息，并在页面结果中看到目标响应。
4. 只有 HTTP `2xx` 且响应体去空白后为 `ok` 才算成功。
5. HTTP `2xx` 但响应体不是 `ok` 属于 `target_rejected`，不会自动重试；先修复 Slack 侧配置，再手动重试。`invalid_blocks`、`invalid_auth`、Webhook 撤销或频道归档都属于需要人工修正的拒绝。

Slack 不返回可供 Tocsin 引用的消息 ID，也不会发送机器幂等键。卡片重试后出现两条消息是预期风险。

## 邮件网关

邮件目标验证的是“Tocsin 能否让网关接受一封邮件”，不是“邮件是否到达收件箱”。使用测试收件人，并让网关记录请求 ID、入队结果、SMTP 结果和退信，但不要在网关日志中记录完整认证 Header。

验收时逐项核对：

1. Test 请求为 `POST` JSON，包含 `to`、`from`、可选 `replyTo`、`subject`、`text`、`html` 和 `metadata`。
2. 主题与正文可分别检查：`subjectTemplate` 覆盖 `subjectPrefix`；纯文本缺失时使用内置正文；`htmlTemplate` 缺失时生成转义后的 `<pre>`。
3. 任意 `2xx` 都会被 Tocsin 记为成功。推荐网关持久化入队后返回 `202`；如果响应体包含 `gatewayMessageId`，Tocsin 不会解析或保存它。
4. 测试收件人确实收到邮件；若 Tocsin 已成功但收件箱没有邮件，继续查网关队列、SMTP 日志、退信、垃圾邮件与发件域认证。
5. 用 `metadata.eventId + metadata.destinationId` 作为网关幂等键。重复请求应返回 `2xx` 并说明已幂等处理，不要返回 `409`，因为 `409` 会触发 Tocsin 重试。

网关返回 `2xx` 后发生的退信、投诉或最终送达失败，不会回写为 Tocsin Delivery 失败。

## 飞书机器人 Webhook

Webhook 模式适合只向群发送文本或卡片。它没有应用消息句柄，因此不能电话加急；目标配置也不接受 `urgent` 区块。

验收时逐项核对：

1. 群机器人仍启用，Webhook URL 未被撤销；如配置了签名密钥，先完成密钥轮换演练。
2. Preview 检查内置卡片、文本或 Card JSON 的实际内容；变量只会在 JSON 字符串值中插值。
3. Test 向真实群发送一条消息，确认群和机器人范围正确。
4. 非 `2xx` 先看飞书业务码，再看 HTTP 状态。可解析响应中的业务码非 `0` 属于平台拒绝；`99991400`、`11232`、`11233` 等已知限流码可重试。
5. HTTP `2xx` 且响应可解析时，还要求 `code` / `StatusCode` 为 `0` 或 `msg` 为 `success`；响应无法解析时只按 HTTP 结果判定。

Webhook 模式不会产生 `feishu_message_id`，因此不能从 Delivery 详情发起电话加急。需要加急时改用飞书应用发送模式。

## 飞书应用

飞书应用验证分三层，不能互相替代：

1. **应用凭证测试**：只验证 `App ID` 与 `App secret` 能换取 `tenant_access_token`，不发送消息。
2. **目标 Test**：通过应用向 `chat_id` 对应群发送真实消息，验证机器人能力、群关系与发送权限，但不会创建 Delivery，也不会触发电话加急。
3. **真实 Delivery**：由隔离 Route 产生成功投递，验证 `data.message_id` 被记录为目标回执，并确认符合条件的 `firing` 事件能产生预期加急记录。

应用发送验收时逐项核对：

1. 机器人能力已启用并发布，应用机器人在目标群内；群允许机器人加急时再测试电话链路。
2. Preview 和 Test 使用同一发送模式和模板；Test 成功后仍要确认飞书群实际收到消息。
3. 应用发送要求 HTTP `2xx` 且业务码为 `0`。HTTP 成功但响应不可解析或业务码非 `0` 属于目标拒绝；已知限流与 token 失效码按平台错误表处理。
4. 成功响应中的 `data.message_id` 应显示为 Delivery 回执。业务成功但没有消息 ID 时，Tocsin 无法执行自动或手动电话加急。
5. 电话加急只对带飞书消息回执的成功 `firing` Delivery 生效。首次验证使用明确允许演练的小范围接收人，并确认 5 分钟去重窗口。

详细权限、错误码、加急状态机与人工补呼流程见[飞书应用与电话加急](/integrations/feishu-app)。

## 重试与最终送达

先判断错误发生在哪一层，再决定是否重试：

| 现象 | 说明 | 下一步 |
| --- | --- | --- |
| Preview 报未知变量或 JSON 结构错误 | 模板在发送前失败，不会访问下游 | 修正模板；不要通过反复 Test 排查 |
| Test 返回 `401` / `403` | 凭证、签名、机器人权限或群权限有误 | 修复目标配置后重新 Test |
| Test 成功，真实告警没有消息 | Test 绕过 Route、启停、静默、队列和 Worker | 检查 Route 匹配、目标/路由启用、抑制与全局暂停 |
| Delivery `succeeded`，收件人未看到 | 目标接受了请求，不保证最终人工送达 | 查目标系统队列、投递日志、退信或频道成员 |
| Slack `2xx` 但响应非 `ok` | 目标拒绝 Block Kit 或 Webhook 已失效 | 修 Slack 配置后手动重试，不要等待自动重试 |
| 飞书 `2xx` 但业务码非 `0` | 平台拒绝应用、群、权限、接收人或额度配置 | 按业务码修复；仅白名单瞬态码会自动重试 |
| 飞书应用成功但没有回执 | 消息 ID 缺失，后续电话加急无处引用 | 核对应用发送响应；重新走真实 Delivery，不要把手动加急当作补救 |
| 同一通知收到多条 | 超时、可重试状态或手动重试造成至少一次投递 | 用 `eventId` 在接收端去重；飞书与 Slack 没有调用方幂等键 |

自动重试只发生在适配器判定为可重试且尝试次数未耗尽时。默认每次请求最多等待 10 秒，最多尝试 3 次；完整状态与退避见[投递检索、生命周期与重试](/operations/deliveries)。

## 验收记录

每个进入值班链路的通知目标至少记录以下事实：

1. 目标名称、类型、发送模式、启用状态与负责团队。
2. 使用的是内置样例还是历史 Event；Preview 时间与模板版本。
3. Test 的目标接收端、人工确认人、页面结果与目标返回码；只记录脱敏摘要。
4. 隔离 Route、Event ID、Delivery ID、最终状态、HTTP 状态与外部回执。
5. 是否验证 `resolved`、不同 severity、多目标扇出与重试路径。
6. 凭证轮换、地址迁移、退信/积压处理和人工补呼的负责人。

完成目标验收后，再按[值班交接与通知链路验收](/operations/oncall-handoff)做全链路 canary。目标测试、事件接入和真实投递是三个独立证据，不能用其中一个替代另外两个。

相关页面：[通知目标参考](/integrations/destinations) · [邮件网关接入与验收](/integrations/email-gateway) · [飞书应用与电话加急](/integrations/feishu-app) · [投递检索、生命周期与重试](/operations/deliveries) · [值班交接与通知链路验收](/operations/oncall-handoff) · [故障排查](/operations/troubleshooting)
