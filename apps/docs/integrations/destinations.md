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

## 在列表中核对投递路由

「通知目标」列表的「投递路由」列按当前配置静态推算哪些启用路由会向这个目标投递，不需要先产生真实投递。它只读取已保存的路由规则，不读取历史 Event 或 Delivery。

- `N 条可达`：N 条已启用的路由规则引用了这个通知目标，且它们匹配的告警源中至少一个已启用。
- `X/Y 条可达`：Y 条启用路由引用了这个目标，其中 X 条还能收到告警；其余路由匹配的告警源全部停用或已不存在。
- 徽标下方的 `M 条带条件`：这些可达路由中，有 M 条还要求事件满足条件才会投递。它与徽标分两行显示，避免在 1280 宽度下被「投递路由」列裁切。
- `告警源全停用`：有启用路由引用这个目标，但它们匹配的告警源全部停用或已不存在，当前不会有告警到达。
- `无生效路由`：没有已启用的路由规则引用这个通知目标；悬浮提示会说明是否仍有停用路由引用它。

计数口径：

- **可达**要求路由已启用、目标列表中包含该目标，并且路由至少匹配一个已启用的告警源。路由指定了告警源（`sourceIds`）时看其中是否有已启用项；兜底路由（不指定告警源）则要求至少存在一个已启用的告警源，包括之后新建的源。被删除的告警源视为不可用。停用的路由不参与计数，只在悬浮提示里给出停用引用的条数。
- **带条件**指可达路由还填写了严重程度、状态、标签、标题包含或消息包含中的任意一项；只选择告警源算可达性条件，不再重复计入「带条件」。带条件路由只在事件满足条件时投递，不能把 `N 条可达` 理解为“全部告警都会到这里”。
- 该列不判断通知目标自身的启停：目标停用时「状态」列显示停用、已排队投递暂停，路由仍计入可达条数。告警源重新启用后，对应路由会立即恢复可达，无需修改路由配置。
- 该列是配置视图，不评估静默、全局投递暂停、幂等去重、目标端故障或历史送达率。

悬浮徽标可以查看启用路由的名称、其中哪些路由带条件，以及哪些路由因告警源停用而不可达。

::: warning 覆盖不等于送达
`N 条可达` 只说明有 N 条路由的配置会向该目标创建投递，不表示每次都会发送成功。要确认某条具体告警的去向，看 Event 详情的[路由匹配证据](/guide/routes#查看匹配证据)；调整目标配置或凭证后，按[通知目标验收与失败判读](/integrations/destination-verification)重新验收。
:::

告警源列表的[「命中路由」列](/guide/sources#在列表中核对路由覆盖)是反方向的静态口径：它回答“这个告警源被哪些路由覆盖、能否投递”，并要求路由至少关联一个已启用的通知目标。本列回答“哪些启用路由能把告警投递到这个目标”，要求至少一个匹配的告警源启用，不评估其它目标，也不要求该目标自身启用。排查“告警没有到达某个目标”时，两列要一起看。

## 在列表中核对投递健康

「通知目标」列表的「投递健康」列把每个目标最近的投递结果压成两行时间和两个徽标，用来快速判断“这个目标现在还在正常投递吗”。数据由服务端按目标聚合，打开列表、点「刷新」或列表重新获取时计算一次，不是实时轮询的指标。

| 显示 | 含义 |
| --- | --- |
| `成功 <时间>` | 最近一次以 `succeeded` 结束的投递的完成时间，不限时间窗口 |
| `失败 <时间>` | 最近一次进入 `failed` 终态的投递的完成时间，不限时间窗口 |
| `排队 N` | 当前 `pending` 与 `running` 的投递总数，包含等待领取、退避重试和正在发送的投递 |
| `近 24h 失败 N` | 最近 24 小时内创建、且已进入 `failed` 的投递数 |
| `暂无投递` | 有投递记录，但没有成功或失败终态，也没有排队中的投递 |
| `—` | 当前没有任何投递记录，例如刚创建、还没命中路由的目标 |

口径：

- **两个时间都取完成时间**，并且是全部历史里的最大值，不受 24 小时窗口限制。目标可能既有很久以前的成功、也有几分钟前的失败，要把两个时间一起看。
- **只有终态才计入「失败」**。还在自动重试的投递会回到 `pending` 并计入「排队」，不会更新「失败」时间或失败数；用完尝试次数后才转为 `failed`。
- **「排队」包含正在发送**。`running` 也算在内，所以「排队 2」可能是 2 条等待，也可能是 1 条等待加 1 条在途。
- **「近 24h 失败」按创建时间计窗**，不是按失败时间。窗口内创建、稍后才失败的投递仍会计入；窗口之前创建、最近才失败的投递不计入，但会更新「失败」时间。
- **`suppressed` 不参与任何数字**。被静默跳过的投递不排队、也不算失败；只有静默记录的目标会显示「暂无投递」。
- 该列只读 `deliveries` 表，不评估目标启停、路由覆盖、静默规则或历史送达率。停用的目标仍保留最后一次结果；因目标或路由停用而滞留的投递会显示在「排队」里。
- 删除目标或路由会级联删除投递，对应历史也会从该列消失。

::: tip 按这列决定下一步
- 「失败」时间晚于「成功」，或「近 24h 失败」在增长：先按[通知目标验收与失败判读](/integrations/destination-verification)核对目标，再到[投递检索、生命周期与重试](/operations/deliveries)按该目标筛选 `failed` 投递查看错误。
- 「排队」持续不为零：可能是目标或路由被停用、全局投递暂停或正在退避，按[队列滞留与积压](/operations/deliveries#队列滞留与积压)判断。
- 只有「成功」：只说明最近一次终态成功了，不能说明路由会命中每条告警；覆盖范围仍看上一节的「投递路由」列和 Event 详情的路由匹配证据。
:::

该列是 dashboard 的只读展示，不提供 metrics、队列深度 API 或长期趋势；需要阈值告警时，按[生产监控与告警基线](/operations/monitoring)在外部监控系统实现，不要把列表当作唯一数据源。

## 启停与删除前的影响确认

通知目标行的启用、停用与删除都会先打开确认框，把「这次操作会影响谁」拆成可逐项核对的区块；取消不会产生任何写操作。启用与停用可逆，删除不可撤销。

### 启用确认框

- **排队中的投递**：启用会解除目标自身的领取阻断，列出会立即恢复发送的 `pending` 投递数；读取中或读取失败时该行不显示，也不阻止启用。
- **积压的加急呼叫**：只在存在已排队的电话加急时出现，给出启用后会立即派发的人数；已拨出的呼叫无法撤回。

启用不会修改路由或告警源配置。停用期间积压的投递与加急呼叫会在启用后集中处理，确认前先看这两个区块。

### 停用确认框

- **路由影响**：只统计引用该目标且已启用的路由，停用的路由不计数。没有已启用路由时，文案会明确说明目标当前没有被任何启用路由引用。
- **影响 N 个告警源**：列出会失去这条通知路径的上游告警源，口径见[受影响告警源怎么算](#受影响告警源怎么算)。
- **排队中的投递**：只统计 `pending`，不含正在发送的 `running`；读取中或读取失败时该行不显示，也不阻止停用。
- **自动加急也会停止**：只在目标开启自动加急时出现；配置了呼叫对象时给出人数。

停用不会删除 Event、Delivery 或路由配置。已排队投递停在 `pending`，重新启用后继续；排队中的电话加急也在恢复后继续派发。

### 删除确认框

- **将连带删除 / 将收窄 N 条路由**：统计所有引用该目标的路由，**包含已停用路由**。路由不再剩任何目标时整条删除；仍引用其他目标时只移除当前目标的引用，已有投递继续。
- **影响 N 个告警源**：只统计已启用路由与已启用告警源，口径同停用。
- **将一并删除历史记录**：列出 Event、Delivery、attempt、加急呼叫各会删多少；打开确认框时由服务端统计，统计完成前确认按钮暂不可用，有历史时必须勾选确认才能删除。读取失败时提示“计数读取失败，仍可继续删除”并提供重试。

删除会移除目标、相关投递和路由引用，且无法撤销。注意「路由数量」与「受影响告警源数量」口径不同：一条路由可以聚合多个告警源，停用路由也会计入删除框的路由数量，但不会产生受影响告警源。

### 受影响告警源怎么算

该区块读取页面已加载的路由与告警源列表，是打开确认框时的配置快照；它不会再单独发起请求，刚在别处改过配置时先刷新列表再确认。

- **只统计启用路由**：停用路由本来就不投递，不计入。
- **只统计启用告警源**：已停用的告警源不产生新告警，不计入；路由引用了已删除告警源的 id 时忽略。
- **不限来源等于全部来源**：任一启用路由的 `rule.sourceIds` 为空时，文案改为「所有告警源（含后续新增）」。标题中的数量仍是当前已启用告警源的快照，不能按这个数字判断将来新增的告警源。
- **最多列出 5 个名称**：更多的折叠为「等 N 个」。
- **没有受影响告警源时不显示该区块**：不会出现「影响 0 个告警源」。
- **它是配置层静态推算**：不评估静默规则、全局暂停、幂等去重、投递历史或目标历史送达率。受影响只表示“按当前配置该告警源本可以送达这个目标”，不证明它过去每条告警都成功送达。

::: tip 停用前
电话正在响时，停用目标会同时停掉已排队的加急呼叫；恢复后这些呼叫会集中释放，确认前先看「自动加急也会停止」区块。处置顺序见[告警风暴与急停处置](/operations/incident-playbook#停用通知目标)。
:::

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
| `tocsin.deliveryUrl` | 本次投递的 dashboard 直链；预演/测试发送没有真实投递记录时为空 |
| `tocsin.alertCount` | 上游通知组包含的告警条数；上游不提供该数量、或内置合成样例时为空 |
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
事件详情: {{tocsin.eventUrl}}
本次投递: {{tocsin.deliveryUrl}}
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
- 停用通知目标会阻止已启用路由继续向它投递，并暂停该目标已排队的 Delivery；重新启用后再继续。启用、停用与删除确认框列出的受影响告警源、排队投递与级联历史口径见[启停与删除前的影响确认](/integrations/destinations#启停与删除前的影响确认)。
- 通知目标列表的「投递健康」列显示最近成功、最近失败、排队或发送中的数量和近 24 小时失败数，口径见[在列表中核对投递健康](/integrations/destinations#在列表中核对投递健康)。

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
