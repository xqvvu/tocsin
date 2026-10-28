---
title: 邮件网关接入与验收
description: 为 SRE 与运维人员说明 Tocsin 邮件目标的 HTTP 网关契约、模板、幂等、重试、安全和生产验收。
---

# 邮件网关接入与验收

Tocsin 的邮件目标不直接连接 SMTP。它把一封已渲染的邮件以 JSON `POST` 发送给你控制的 HTTP 邮件网关，再由网关完成 SMTP 投递、退信和域名信誉管理。

```text
Route → Email Destination → POST JSON → HTTP 邮件网关 → SMTP/MTA → 收件人
```

因此有两个不同层次的“成功”：

| 层次 | 判定 | Tocsin 能否观察 |
| --- | --- | --- |
| 网关接受请求 | HTTP `2xx` | 能。Delivery 记录为 `succeeded` |
| 邮件最终送达 | 网关/MTA 的 SMTP 结果、退信和投诉 | 不能。必须由邮件基础设施自行记录和处置 |

邮件适配器当前标记为 `experimental`。它适合已经有内部邮件网关、邮件 API 或自建 SMTP 发送服务的团队，不适合把 Tocsin 当作 SMTP 客户端。

## 当前边界

支持：

- 用 `POST` 和 `Content-Type: application/json` 调用一个 HTTP 端点。
- 配置多个收件人、发件人、可选回复地址和附加请求头。
- 使用内置主题与正文，或分别定制主题、纯文本正文和 HTML 正文。
- Preview、真实 Test、异步 Delivery、失败重试和投递证据。

不支持：

- SMTP、SMTPS 或 STARTTLS 直连。
- 附件、抄送（CC）、密送（BCC）和收件人分组。
- 解析网关返回的邮件 ID、退信、投诉或最终送达状态。
- 代替网关管理 SPF、DKIM、DMARC、中继白名单或收件人退订。

## 上线前提

在 Tocsin 中保存目标前，先确认网关满足以下条件：

| 前提 | 验收要点 |
| --- | --- |
| HTTP 接口 | 接受 `POST` JSON，响应体有界，并在 `TOCSIN_DESTINATION_TIMEOUT_MS` 内返回 `2xx` |
| 网络路径 | Tocsin 容器能解析网关域名、建立 TLS 连接，并通过防火墙或网络策略访问目标端口 |
| 请求认证 | 网关有独立凭证；Tocsin 可通过自定义 Header 发送，不要把凭证写进 URL 查询串 |
| 发件人资格 | 网关允许配置的 `from` 地址；发件域已完成所需的 SPF、DKIM 与 DMARC 配置 |
| 收件人策略 | 网关允许目标收件域，并明确内部中继、外部收件人或测试地址的处理规则 |
| 队列与幂等 | 网关在返回 `2xx` 前已完成可恢复的入队；重复请求可按事件键安全处理 |
| 运维责任 | 网关日志、退信、限流、队列积压和最终送达有明确负责人 |

::: warning `2xx` 不是送达回执
如果网关在返回 `202 Accepted` 后异步发送邮件，Tocsin 仍会把这次 Delivery 记为成功。之后 SMTP 退信、收件人拒收或网关队列丢失，都不会自动把 Tocsin 中的 Delivery 改为失败。
:::

## 配置通知目标

1. 打开「通知目标」，新建目标并选择「邮件」。
2. 填写网关的 `endpointUrl`。生产环境优先使用 HTTPS；如走内部明文 HTTP，应限制在受控网段。
3. 填写收件人。表单接受逗号或换行分隔的裸邮件地址，保存后成为 `to` 数组。
4. 填写 `from`，并按需填写 `replyTo`。两者都应是网关接受的地址格式。
5. 选择主题和正文策略。内置内容可直接预览，复杂格式使用下文的三类模板字段。
6. 如网关需要 Bearer Token 或 API Key，在 Header 区域每行填写一个 `Name: value`。
7. 先「预览」检查渲染结果，再「测试」向真实收件人发送一封邮件。
8. 保存并启用目标，创建一条受控 Route，最后用真实 Event 走通 Delivery。

网关 URL 和 Header 值属于服务端凭证。编辑目标时凭证值留空表示保留数据库中的原值；不要通过截图、工单或聊天发送完整 URL 与 Header。

::: warning 测试会发送真实邮件
「测试」绕过投递队列，即使全局出站投递已暂停也可能到达网关。测试不会创建 Event 或 Delivery，因此成功只证明这次 HTTP 请求成功，不证明 Route 会匹配或后续队列正常。
:::

## 网关请求契约

Tocsin 固定使用 `POST`。请求头默认包含 `Content-Type: application/json`，然后合并目标中配置的附加 Header：

```http
POST /send HTTP/1.1
Host: mail-gateway.example.test
Content-Type: application/json
Authorization: Bearer <gateway-token>
```

请求体示例：

```json
{
  "to": ["oncall@example.test", "sre@example.test"],
  "from": "tocsin@example.test",
  "replyTo": "sre-owner@example.test",
  "subject": "[Critical Firing] Checkout API unavailable",
  "text": "[Critical Firing] Checkout API unavailable\n\nHTTP 503 rate exceeded threshold",
  "html": "<pre>[Critical Firing] Checkout API unavailable\n\nHTTP 503 rate exceeded threshold</pre>",
  "metadata": {
    "eventId": "event-...",
    "sourceId": "source-...",
    "destinationId": "destination-...",
    "fingerprint": "checkout-api",
    "severity": "critical",
    "status": "firing"
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `to` | 字符串数组，来自目标收件人配置。 |
| `from` | 目标发件人。Tocsin 不擅自改写，也不推导域名。 |
| `replyTo` | 仅在目标配置了回复地址时出现。 |
| `subject` | 最终渲染后的完整主题。 |
| `text` | 纯文本正文，始终存在。 |
| `html` | HTML 正文，始终存在；未配置 `htmlTemplate` 时是转义后的 `<pre>`。 |
| `metadata.eventId` | 一次接入 Event 的稳定标识，可作为幂等键的一部分。 |
| `metadata.destinationId` | 当前通知目标 ID。同一 Event 发往多个邮件目标时可据此区分。 |
| `metadata.fingerprint` | 告警身份，不等同于 Event ID，也不保证全局唯一。 |
| `metadata.severity` / `status` | 稳定机器值，不是界面翻译后的文案。 |

`metadata` 只包含以上字段，不包含 Route ID、事件直链、Source 名称或模板上下文。需要在邮件中展示的运营信息应写入主题或正文模板；网关不应依赖请求体中的凭证或隐藏字段。

## 网关响应契约

Tocsin 只按 HTTP 状态判断本次请求成功或失败：

| 网关响应 | Tocsin 行为 |
| --- | --- |
| `200`、`201`、`202`、`204` 或其它 `2xx` | 记为成功并读取响应体作为证据；不解析 JSON，也不提取邮件 ID |
| `408`、`409`、`425`、`429` 或 `5xx` | 记为可重试失败，按 Delivery 退避策略再次发送 |
| 其它 `4xx` | 记为不可重试失败，修正目标或网关配置后再人工重试 |
| 连接失败、TLS 错误或超时 | 记为可重试的网络错误或超时 |

推荐网关在完成持久化入队后返回 `202`，并用简短 JSON 描述接受结果：

```json
{
  "status": "queued",
  "gatewayMessageId": "mail-..."
}
```

这只是运维约定，Tocsin 不会使用 `gatewayMessageId`。响应正文会进入 Test 或 Delivery 证据，并在返回 dashboard 前脱敏；不要回显请求 Header、网关凭证或其它 secret。

不要把“幂等命中，已忽略重复请求”表达成 `409 Conflict`。`409` 在 Tocsin 中属于可重试状态，会继续触发后续尝试；如果重复请求不应再发送邮件，网关应返回 `2xx` 并说明已幂等处理。

## 超时与重试

单次邮件网关请求默认超时为 10 秒，可用 `TOCSIN_DESTINATION_TIMEOUT_MS` 调整到最多 30 秒。该 deadline 同时覆盖连接、响应头和响应体读取；网关已经返回响应头但正文迟迟不结束时，整次尝试仍可能超时。

全局超时不能按 Destination 单独设置。比较慢的邮件网关会与所有 Webhook、Slack 和飞书目标共享同一个上限，调整前应同时评估其它目标。

发生以下情况时，一次已接受邮件可能被再次投递：

- 网关已经入队，但客户端在读取响应前超时。
- 网关接受请求后连接中断，Tocsin 只能看到网络错误。
- 网关返回 `5xx`、`429` 或其它可重试状态。
- 操作者在 Delivery detail 手动重试。

建议网关以 `metadata.eventId + metadata.destinationId` 建立幂等键。相同键再次到达时，如果原邮件已入队，返回 `2xx` 并跳过第二次发送。这样既能吸收 Tocsin 的不确定结果，也能覆盖例如同一 Event 发往多个邮件目标的情况。

默认最多尝试 3 次，退避从 30 秒开始指数增长，单次上限 15 分钟。Tocsin 使用自己的固定退避，不依赖网关的 `Retry-After` Header。完整状态和人工重试语义见[投递检索、生命周期与重试](/operations/deliveries)。

## 主题与正文

邮件目标有三个独立内容槽：

| 字段 | 行为 |
| --- | --- |
| `subjectPrefix` | 添加到内置主题前的固定前缀。 |
| `subjectTemplate` | 生成完整主题；设置后忽略 `subjectPrefix`。 |
| `template` 的 `text` | 自定义纯文本正文；未设置时使用内置正文。 |
| `htmlTemplate` | 自定义 HTML 正文；未设置时把纯文本正文转义后包进 `<pre>`。 |

每个模板字段最长 4000 个字符，保存时去除首尾空白。未知变量和不允许的变量路径会阻止保存；若历史配置绕过校验，Preview 会显示诊断，Test 或真实投递会在请求前以 `configuration_error` 失败。

示例主题：

```text
[{{event.severityDisplay}}] {{event.title}} · {{source.name}}
```

示例 HTML：

```html
<h1>{{event.title}}</h1>
<p>{{event.message}}</p>
<p>严重程度：{{event.severityDisplay}}，状态：{{event.statusDisplay}}</p>
<p><a href="{{tocsin.eventUrl}}">在 Tocsin 中查看</a></p>
```

HTML 模板的规则是“标记可信、变量转义”：

- 你手写的 HTML 标签原样发送。
- 每个模板变量值都会转义 `& < > " '`，即使变量来自上游 payload。
- 没有 `raw` 或关闭转义的开关。
- 纯文本正文和主题不会做 HTML 转义；网关在生成 MIME 邮件时应分别编码。

模板变量、缺失路径和受控动态绑定的完整语法见[通知目标参考](/integrations/destinations#模板变量)。主题和 HTML 模板复用文本模板中定义的 bindings；没有文本模板时不要依赖 `bindings.*`。

内置测试样例不对应真实 Event，因此 <code v-pre>{{tocsin.eventUrl}}</code> 为空。需要验证直链时，在 Preview 或 Test 中选择一条历史 Event。

## 安全与凭证轮换

- 网关 URL 与 Header 值按服务端 secret 处理；不要把它们写进模板或 `metadata`。
- 首选独立、最小权限的网关 Token，并按环境或实例区分，不要复用 dashboard 登录密码。
- 网关日志不要记录完整 `Authorization`、原始请求体或收件人之外的敏感上下文。
- 可移植配置导出会把邮件网关 URL 和 Header 值替换为环境变量引用；备份文件仍可能包含可解密或明文 secret，必须按敏感数据保护。
- 轮换凭证时，先让网关同时接受新旧值或准备短暂切换窗口，再更新 Tocsin Header、执行 Test，并观察一次真实 Delivery；完整切换与旧队列处理见[通知目标凭证轮换与故障演练](/integrations/destination-rotation)。

邮件网关 URL 和 Header 值不会被注入模板变量。<code v-pre>{{headers.authorization}}</code>、<code v-pre>{{config.endpointUrl}}</code> 一类写法会被拒绝，不会把 secret 带进预览、正文或投递证据。

## 故障排查

| 现象 | 优先检查 |
| --- | --- |
| Test 返回 `401` 或 `403` | Header 名称、Bearer 前缀、网关 Token 有效性与权限；编辑时留空表示保留旧值 |
| Test 返回 `404` | `endpointUrl` 是否指向具体发送路径，而不是网关首页或错误 API 版本 |
| Test 返回 `400` 或 `422` | `from`、`to`、`replyTo` 是否被网关接受；网关是否要求额外信封字段 |
| 连接失败、TLS 错误或超时 | 从容器网络检查 DNS、出站策略、证书链和端口；不要只在操作者笔记本上验证 |
| `2xx` 但收件箱没有邮件 | 查网关队列与 SMTP 日志、垃圾邮件、退信、收件人拒收和发件域认证 |
| Delivery 成功但邮件稍后退信 | 这是网关/MTA 的后续结果；Tocsin 不会收到或回写退信状态 |
| 同一告警收到多封邮件 | 检查超时后的重试、可重试状态码、网关队列重试与缺少幂等键 |
| HTML 显示异常或内容被转义 | 标记是否由模板提供；变量值按设计转义，尝试直接插入的 HTML 会显示为文本 |
| 邮件中的 Tocsin 链接为空 | 内置合成样例没有真实 Event；改用历史 Event 或验证真实 Delivery |
| Delivery 停在 `pending` 或 `running` | 检查 readiness、Worker、全局暂停和运行日志；这不一定是邮件网关问题 |

日志类别、request id 与安全检索方式见[日志与可观测性](/operations/observability)；Webhook 已接入但没有 Route 或 Delivery 时见[故障排查](/operations/troubleshooting)。

## 生产验收

1. 用非生产收件人验证网关请求、认证、发件人与队列。
2. 在 Tocsin 用内置样例执行 Preview，确认主题、纯文本和 HTML 都符合预期。
3. 选择历史 Event 再 Preview，确认 `payload.*` 与 `tocsin.eventUrl` 可用。
4. 执行 Test，确认收件人收到真实邮件，网关日志中的状态为成功。
5. 用一条受控 `firing` Event 走完 Route → Delivery，并在投递详情核对 rendered payload、HTTP 状态与响应摘要。
6. 故意发送一次无效网关凭证，确认出现不可重试的认证失败；恢复凭证后从 Delivery 手动重试。
7. 模拟网关超时或返回 `503`，确认 Delivery 进入退避重试，并用相同事件键验证网关幂等。
8. 验证 `resolved`、不同 severity 和多目标 Route 的邮件主题与收件人。
9. 把网关负责人、退信处理入口、队列积压告警和凭证轮换步骤写入值班手册。

相关页面：[通知目标参考](/integrations/destinations) · [通知目标凭证轮换与故障演练](/integrations/destination-rotation) · [投递检索、生命周期与重试](/operations/deliveries) · [环境变量与运行时配置](/operations/configuration) · [可移植配置参考](/operations/portable-config) · [日志与可观测性](/operations/observability) · [故障排查](/operations/troubleshooting)
