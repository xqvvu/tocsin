---
title: 通知目标参考
description: Tocsin 飞书、Slack、邮件网关与通用 Webhook 通知目标的配置、模板、测试和排障参考。
---

# 通知目标参考

通知目标（Destination）定义一条出站消息发往哪里、使用什么模板，以及需要哪些服务端凭证。一个路由规则可以同时投递到一个或多个通知目标。

当前内置适配器：

| 类型 | 状态 | 适用场景 | 发送协议 |
| --- | --- | --- | --- |
| 飞书（Feishu） | stable | 群机器人文本或卡片、应用发送、可选电话加急 | 飞书群机器人 Webhook 或飞书应用 API |
| Slack | stable | 运维频道通知 | Slack Incoming Webhook |
| 通用 Webhook | stable | 内部事件总线、自动化平台或自建接收端 | 自定义 HTTP `POST`、`PUT` 或 `PATCH` |
| 邮件（Email） | experimental | 通过自建 HTTP 邮件网关发送邮件 | 以 JSON 调用邮件网关，不是 SMTP 直连 |

## 验收顺序

不要把“已经收到 Webhook”误认为“通知目标已经送达”。建议每次按下面的顺序验证；逐类型的验收条件与失败判读见[通知目标验收与失败判读](/integrations/destination-verification)：

1. **预览（Preview）**：不发起网络请求，用内置样例或最近一条历史 Event 渲染目标载荷。适合检查模板变量和结构。
2. **测试（Test）**：绕过投递队列，立即向真实目标发送一条消息，用于验证网络、凭证和上游接受规则。测试不会创建 Event 或 Delivery。
3. **真实投递**：由已启用的路由规则命中 Event 后创建 Delivery，再由进程内 Worker 异步发送。

::: warning 测试会产生真实通知
测试动作会直接调用下游系统，即使全局出站投递已暂停也不会被队列拦住。先确认接收群或接收端允许调试消息；测试通过只能证明目标可用，不能证明路由条件会命中。
:::

目标页的“测试”可以使用内置样例，也可以选一条最近的历史 Event。选择历史 Event 时，会复用真实标题、标签、时间格式和已脱敏的原始载荷，更适合验证 `payload.*` 模板变量。

## 凭证与数据暴露

| 数据 | 处理方式 |
| --- | --- |
| Webhook URL、飞书签名密钥、邮件网关 URL、Header 值 | 只保存在服务端；编辑时留空表示保留原值 |
| Header 名称、HTTP 方法、收件人、模板模式和模板内容 | 已认证的运维人员可在目标配置中查看 |
| 预览载荷、测试结果、Delivery 错误与响应体 | 返回前再次脱敏 |
| 模板上下文 | 不包含目标配置、认证 Header、Token、签名密钥或飞书应用密钥 |

不要把生产 Webhook URL、签名密钥、Bearer Token 或邮件网关密码写入公开工单、仓库文档或聊天记录。轮换凭证后，重新测试目标并观察一次真实 Delivery；并行切换、旧队列和紧急撤销顺序见[通知目标凭证轮换与故障演练](/integrations/destination-rotation)。

## 飞书

飞书目标有两种发送方式，二者能力不同。

| 发送方式 | 必填配置 | 行为 |
| --- | --- | --- |
| Webhook 机器人（`webhook`，默认） | `webhookUrl`；可选 `signSecret` | 向自定义群机器人发送文本或卡片，配置签名后附加飞书签名 |
| 飞书应用（`app`） | 已登记的飞书应用 `appRef`、群 `chatId` | 服务端解析应用凭证并调用飞书消息 API；消息句柄可用于后续电话加急 |

Webhook 模式的群机器人仍在飞书中配置。应用模式需要先在「飞书应用」中登记应用，并确保应用机器人已加入目标群。飞书应用凭证由集成记录管理，不复存在通知目标配置里。

### 模板

| 模板模式 | 说明 |
| --- | --- |
| 内置卡片（`builtin`） | 默认选择；使用当前实例语言和时区，并根据 `firing`、`resolved`、`unknown` 显示动态状态色 |
| 文本（`text`） | 发送飞书文本消息 |
| 飞书卡片（`feishu_card`） | 使用飞书原生 Card JSON；只在 JSON 字符串值中插值变量 |

内置卡片不是固定红色模板。默认绑定会把 `event.status` 映射为状态色；已有自定义卡片不会在后台被自动改写。编辑器中可以显式应用动态状态颜色，再通过预览确认。

### 电话加急

电话加急只适用于**飞书应用发送模式**。Webhook 机器人模式没有可用的消息句柄，因此不能启用加急配置。

飞书应用权限、群前置条件、自动与手动触发、去重、重试和错误码见[飞书应用与电话加急](/integrations/feishu-app)。本页只说明目标字段与发送语义。

- 自动加急只在真实投递成功、Event 状态为 `firing` 且严重程度命中门槛时触发。
- 严重程度门槛留空时按 `critical` 处理。
- 每次最多配置 200 个接收人，ID 不能重复。
- `open_id`、`user_id`、`union_id` 必须与接收人 ID 类型一致；推荐使用 `open_id`。
- 接收人必须已在目标群内，并在飞书应用可用范围内；群设置也必须允许该应用发起加急。

加急是独立的电话呼叫动作。卡片发送成功后，即使加急请求失败，也不应通过手工重试整条 Delivery 来重复发送卡片；应在投递详情中查看加急记录和目标返回信息。

## Slack

Slack 目标通过 Incoming Webhook 向频道发送 Block Kit 消息。

| 配置 | 说明 |
| --- | --- |
| `webhookUrl` | 必填；从 Slack App 的 Incoming Webhook 取得，按服务端密钥处理 |
| 模板 `text` | 保留 Tocsin 默认 Block Kit 结构，只替换正文消息 |
| 模板 `slack_blocks` | 用完整 JSON 对象替换 Slack 请求体 |

未设置自定义模板时，Tocsin 会生成包含严重程度、标题、正文、告警源、fingerprint、发生时间与 Event ID 的默认消息。`slack_blocks` 使用对象根结构，典型形状如下：

```json
{
  "text": "[{{event.severityDisplay}}] {{event.title}}",
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "{{event.title}}"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "{{event.message}}"
      }
    }
  ]
}
```

Slack HTTP `2xx` 且响应体去空白后为 `ok` 才视为发送成功。其他响应会成为目标拒绝或 HTTP 错误，应以 Delivery 中脱敏后的响应信息为准。

## 通用 Webhook

适合把 Event 转发给自建接收端、内部事件总线或其他自动化系统。

| 配置 | 说明 |
| --- | --- |
| `url` | 必填目标地址，按服务端密钥处理 |
| `method` | `POST`、`PUT` 或 `PATCH`，默认 `POST` |
| `headers` | 自定义请求头；值只保存在服务端 |
| 模板 `text` | 保留默认信封，只替换 `message` 字段 |
| 模板 `json_payload` | 用自定义 JSON 对象替换整个请求体 |

默认请求体会同时携带 Event 标识、告警源、目标摘要、规范化告警和正文：

```json
{
  "eventId": "event-...",
  "source": {
    "id": "source-...",
    "name": "Checkout alerts",
    "provider": "grafana"
  },
  "destination": {
    "id": "destination-...",
    "name": "Internal event bus",
    "kind": "generic_webhook"
  },
  "alert": {
    "title": "Checkout latency high",
    "severity": "critical",
    "status": "firing",
    "fingerprint": "checkout-latency",
    "labels": {
      "service": "checkout"
    }
  },
  "message": "p95 latency is above 2s"
}
```

自定义 JSON 负载只在字符串值中插值变量，模板中的 URL 和 Header 不会自动进入请求体：

```json
{
  "schema": "tocsin.alert.v1",
  "id": "{{event.id}}",
  "title": "{{event.title}}",
  "severity": "{{event.severity}}",
  "status": "{{event.status}}",
  "dashboardUrl": "{{tocsin.eventUrl}}"
}
```

接收端应返回 `2xx`。`408`、`409`、`425`、`429`、`5xx`、连接失败和超时通常会进入重试；其他 `4xx` 通常作为不可重试失败。接收端应基于 `eventId` 或自身幂等键处理重复请求。

## 邮件

邮件通道当前标记为 experimental。它不直接连接 SMTP，而是把一个 JSON 请求发送给你控制的 HTTP 邮件网关。

网关请求与响应契约、超时和幂等策略、发件域前置条件与生产验收见[邮件网关接入与验收](/integrations/email-gateway)。本页只保留目标字段与通用投递语义。

| 配置 | 说明 |
| --- | --- |
| `endpointUrl` | 必填邮件网关地址，按服务端密钥处理 |
| `to` | 必填，至少一个收件人 |
| `from` | 必填发件人地址 |
| `replyTo` | 可选回复地址 |
| `subjectPrefix` | 默认主题前缀；设置 `subjectTemplate` 后不再生效 |
| `subjectTemplate` | 用模板变量生成完整邮件主题 |
| `template` | 可选纯文本正文模板 |
| `htmlTemplate` | 可选 HTML 正文；变量值会进行 HTML 转义 |
| `headers` | 调用邮件网关时附加的 Header；值只保存在服务端 |

邮件网关收到的请求体形状：

```json
{
  "to": ["oncall@example.test"],
  "from": "tocsin@example.test",
  "replyTo": "sre@example.test",
  "subject": "[critical firing] Checkout latency high",
  "text": "p95 latency is above 2s",
  "html": "<pre>p95 latency is above 2s</pre>",
  "metadata": {
    "eventId": "event-...",
    "sourceId": "source-...",
    "destinationId": "destination-...",
    "fingerprint": "checkout-latency",
    "severity": "critical",
    "status": "firing"
  }
}
```

未提供 `htmlTemplate` 时，Tocsin 会把文本正文转义后放入 `<pre>`。自定义 HTML 结构按原样发送，但每个模板变量值都会转义；不要让模板自行拼接未经验证的 HTML。

## 模板变量

模板只做确定性字符串插值，不执行 JavaScript、Shell、SQL 或任意表达式。未知变量会在保存或预览时产生错误。

| 变量 | 内容 |
| --- | --- |
| `event.id`、`event.title`、`event.message` | Event 标识、标题与正文 |
| `event.severity`、`event.severityDisplay` | 机器值与当前语言下的展示值 |
| `event.status`、`event.statusDisplay` | 机器值与当前语言下的展示值 |
| `event.fingerprint` | 告警身份 |
| `event.occurredAt`、`event.occurredAtDisplay` | 原始时间与按实例时区格式化的时间 |
| `event.labels.<key>` | 规范化后的告警标签 |
| `source.id`、`source.name`、`source.provider` | 告警源信息 |
| `destination.id`、`destination.name`、`destination.kind` | 当前通知目标信息 |
| `tocsin.eventUrl` | 当前 Event 的 dashboard 直链；内置合成样例无法生成链接时为空 |
| `payload.<path>` | 已递归脱敏的原始载荷标量字段 |

`payload` 路径支持对象属性和数组下标，例如：

```text
{{payload.monitor.name}}
{{payload.items[0].value}}
{{payload.commonLabels["threshold.name"]}}
```

缺失路径、对象、数组和 `null` 都渲染为空字符串。原始载荷结构由上游系统决定，可能随版本变化；跨系统通用内容应优先使用规范化 Event 字段。

### 文本模板示例

```text
[{{event.severityDisplay}}] {{event.title}}

{{event.message}}

告警源: {{source.name}}
状态: {{event.statusDisplay}}
发生时间: {{event.occurredAtDisplay}}
详情: {{tocsin.eventUrl}}
```

JSON 模板（飞书卡片、Slack blocks、通用 Webhook JSON）只插值字符串叶子；对象键、数字和布尔值不会被替换。

### 动态绑定

飞书卡片可以用受控 `bindings` 把有限字段映射成颜色等字符串，而不复制多份完整模板。允许的 selector 只有 `event.status`、`event.severity`、`source.provider` 与 `destination.kind`。

```json
{
  "bindings": {
    "statusColor": {
      "select": "event.status",
      "cases": {
        "firing": "red",
        "resolved": "green",
        "unknown": "grey"
      },
      "fallback": "grey"
    }
  }
}
```

卡片中的字符串值可用 <code v-pre>{{bindings.statusColor}}</code> 引用结果。绑定不是条件语言，不能返回对象、数组、数字、布尔值或新的模板片段。

## 投递与重试

投递状态、自动退避、手动重试、全局暂停和积压处置的完整说明见[投递检索、生命周期与重试](/operations/deliveries)。

- 单次出站请求默认最多等待 10 秒，可用 `TOCSIN_DESTINATION_TIMEOUT_MS` 调整；连接失败和超时会记录为可重试错误。
- 默认最多尝试 3 次，退避从 30 秒开始指数增长，上限 15 分钟。模板错误、无效配置和部分目标拒绝不会重试。
- 飞书和 Slack 的成功语义不只是 HTTP 状态：飞书检查业务码，Slack 要求响应体为 `ok`。
- 已排队的 Delivery 在真正发送时读取通知目标的最新配置，包括端点、模板、Header 和签名。修改配置会影响尚在队列中的投递。
- 停用通知目标会阻止已启用路由继续向它投递，并暂停该目标已排队的 Delivery；重新启用后再继续。
- 通知目标列表的“投递健康”会显示最近成功、最近失败、排队或发送中的数量和近 24 小时失败数。

## 排障

| 现象 | 优先检查 |
| --- | --- |
| 测试成功，但真实告警没有通知 | 路由规则是否启用并匹配；通知目标是否启用；是否被抑制；Worker 与队列是否暂停 |
| 预览报未知变量 | 使用“可用变量”面板中的路径；检查 JSON 变量是否写在字符串值内 |
| 目标返回 `401`、`403` 或飞书业务码 | 重新核对服务端保存的 Webhook、签名密钥、应用凭证与目标群权限 |
| Slack 返回 `invalid_blocks` | 用 `slack_blocks` 预览检查对象根、Block Kit 结构和字段长度 |
| 通用 Webhook 持续 `4xx` | 核对 URL、方法、Header、JSON 结构与接收端幂等策略；不要只根据 TLS 连通性判断 |
| 邮件网关拒绝请求 | 核对 JSON 信封、发件域、认证 Header 与网关幂等策略；按[邮件网关接入与验收](/integrations/email-gateway#故障排查)逐项排查 |
| Delivery 停在 `pending` 或 `running` | 检查 readiness 中的 Worker、队列暂停状态和运行日志；查看下次重试时间与 attempt history |

相关页面：[通知目标验收与失败判读](/integrations/destination-verification) · [通知目标凭证轮换与故障演练](/integrations/destination-rotation) · [告警源接入参考](/integrations/providers) · [处理链路与概念](/guide/concepts) · [故障排查](/operations/troubleshooting)
