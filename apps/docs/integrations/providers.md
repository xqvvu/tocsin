---
title: 告警源接入参考
description: 为 SRE 与运维人员整理 Tocsin 内置 Provider 的 Webhook 认证、载荷契约和规范化规则。
---

# 告警源接入参考

每个上游系统应创建一个独立告警源（Source），并选择匹配其真实请求体的 Provider。所有内置 Provider 共用同一个告警源 Webhook 入口；差异在认证后的 JSON 解析和规范化，而不是 URL 路径。

创建、Token 轮换、凭据丢失处置和停用删除影响见[告警源接入与生命周期](/guide/sources)。

当前内置解析器：

| 上游 | 控制台 Provider | 适配载荷 |
| --- | --- | --- |
| 自定义系统 | Generic Webhook | 推荐 JSON 对象，按约定字段提取告警 |
| Alertmanager | Alertmanager | 原生 Webhook 通知载荷 |
| SigNoz | SigNoz | Alertmanager 兼容的 Webhook 载荷 |
| Grafana | Grafana | Grafana Alerting Webhook 载荷 |
| Uptime Kuma | Uptime Kuma | 通知 Webhook 中的 `monitor` 与 `heartbeat` |
| FastGPT | FastGPT 模型探测 | FastGPT 模型状态探测事件 |

需要逐项发送可复制的测试载荷并判读 `202` / `400` 时，使用[Provider 接入验收配方](/integrations/provider-verification)。

## 通用接入契约

在 Tocsin 中创建告警源后，使用提示中一次性显示的 URL 与接入 Token：

```http
POST https://tocsin.example.com/api/sources/<source-id>/webhook
Content-Type: application/json
Authorization: Bearer <source-token>
```

接入认证接受以下任一有效凭据：

| 凭据 | 请求头 |
| --- | --- |
| 告警源接入 Token | `Authorization: Bearer <source-token>` |
| 告警源接入 Token | `X-Tocsin-Source-Token: <source-token>` |
| 告警源额外共享密钥 | `X-Tocsin-Provider-Secret: <shared-secret>` |

Token 与共享密钥不必同时提供。未配置额外共享密钥时，`X-Tocsin-Provider-Secret` 不能替代接入 Token。浏览器 dashboard session 不适用于这个入口。

请求体必须是有效 JSON，推荐使用 UTF-8 与 `application/json`。默认请求体上限为 `1 MiB`，可配置到 `10 MiB`；反向代理的上限不能低于应用配置。

### HTTP 响应

| 状态 | 含义 | 运维动作 |
| --- | --- | --- |
| `202` | Event 已保存，匹配的 Delivery 已入队；目标尚未保证送达 | 记录响应中的 `eventId`，到 Events 与 Deliveries 核对结果 |
| `400` | JSON 无效，或 Provider 无法解析该载荷 | 若响应带 `eventId`，打开对应 Event 查看脱敏后的解析失败证据 |
| `401` | 缺少或无法验证凭据 | 只从受保护的 secret store 重新核对 URL 与 Token |
| `403` | 告警源已停用 | 确认当前变更窗口，再决定是否启用 |
| `404` | 告警源不存在 | 检查 Source ID 与复制下来的完整 URL |
| `413` | 请求体超过实例上限 | 缩小载荷或由运维评估后调整 `TOCSIN_MAX_WEBHOOK_BYTES` |

成功响应形如：

```json
{
  "accepted": true,
  "eventId": "event-...",
  "deliveriesCreated": 1,
  "deliveriesDeduped": 0
}
```

`202` 只代表接入成功。Route 未命中、Destination 发送失败或 Delivery 被抑制时，该响应仍然可能是 `202`。

## 通用字段规范化

路由与通知模板使用规范化后的 severity、status、labels、title 与 message。除 Uptime Kuma 和 FastGPT 的专用规则外，优先级以下表为准。

| severity | 识别值（不区分大小写） |
| --- | --- |
| `critical` | `critical`、`crit`、`p0`、`p1`、`high`、`error`、`fatal` |
| `warning` | `warning`、`warn`、`p2`、`medium` |
| `info` | `info`、`informational`、`low`、`notice`、`ok` |
| `unknown` | 其他值或缺失 |

| status | 识别值（不区分大小写） |
| --- | --- |
| `firing` | `firing`、`triggered`、`alerting`、`open`、`active`、`problem` |
| `resolved` | `resolved`、`recovering`、`recovered`、`closed`、`ok`、`normal` |
| `unknown` | 其他值或缺失 |

## Generic Webhook

适合内部脚本、发布系统或尚未有专用适配器的监控系统。推荐发送 JSON 对象；Provider 会忽略额外字段，但非对象 JSON 只能生成默认标题、消息与 fingerprint，无法按字段参与路由。

```json
{
  "id": "checkout-20261027-01",
  "title": "Checkout API error rate high",
  "message": "5xx rate is above 5%",
  "severity": "critical",
  "status": "firing",
  "labels": {
    "service": "checkout",
    "environment": "prod"
  },
  "occurredAt": "2026-10-27T08:00:00Z"
}
```

| 规范化字段 | 字段选择顺序 |
| --- | --- |
| title | `title`、`alert`、`alertname`、`name`、`summary`；缺失时生成默认标题 |
| message | `message`、`description`、`text`、`body`；缺失时使用规范化 JSON |
| severity | `severity`、`level`、`priority`，再回退到 `labels.severity` |
| status | `status`、`state`，再回退到 `labels.status` |
| fingerprint | `fingerprint`、`alertId`、`alert_id`；缺失时按载荷哈希生成 |
| 幂等键 | `idempotencyKey`、`idempotency_key`、`requestId`、`request_id`、`eventId`、`id`；缺失时按载荷哈希生成 |
| occurredAt | `occurredAt`、`occurred_at`、`startsAt`、`starts_at`、`time`、`timestamp` |

`labels` 接受字符串、数字与布尔值。顶层的 `service`、`environment`、`env`、`cluster`、`team`、`severity`、`status` 也会补充为 labels，但不会覆盖 `labels` 中已有的同名键。

## Alertmanager 与 SigNoz

Alertmanager 使用原生 Webhook 通知格式；SigNoz 使用 Alertmanager 兼容格式。两者共享同一套解析规则。

```json
{
  "version": "4",
  "receiver": "tocsin",
  "status": "firing",
  "groupKey": "{}:{alertname=\"InstanceDown\"}",
  "commonLabels": {
    "alertname": "InstanceDown",
    "service": "checkout",
    "severity": "critical"
  },
  "commonAnnotations": {
    "summary": "Checkout instance down"
  },
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "instance": "checkout-api-1",
        "severity": "critical"
      },
      "annotations": {
        "description": "checkout-api-1 failed health checks"
      },
      "startsAt": "2026-10-27T07:58:00Z",
      "endsAt": "0001-01-01T00:00:00Z",
      "fingerprint": "alertmanager-fingerprint-1"
    }
  ]
}
```

解析规则：

- 先合并 `commonLabels`，再用 `alerts[0].labels` 覆盖同名键。
- title 优先使用合并后的 `labels.alertname`，然后才使用 annotations。
- status 优先取顶层 `status`，再取首条 alert 的 `status`。
- severity 取合并后的 `labels.severity`。
- firing 使用首条 alert 的 `startsAt`；resolved 使用 `endsAt`。时间无效时回退到 Tocsin 接收时间。
- fingerprint 优先取首条 alert 的 `fingerprint`，其次取 `groupKey`，最后使用载荷哈希。
- 幂等键基于完整请求载荷，不是基于 fingerprint。

一个通知组包含多条 alerts 时，Tocsin 只为规范化 Event 使用首条 alert，并在 Provider metadata 中保留 `alertCount`。当前不会把同一通知组拆成多个 Event 或 Delivery。通知模板可以用 <code v-pre>{{tocsin.alertCount}}</code> 读出这个条数，在群里提示「本组共 N 条告警」；上游不提供该数量时渲染为空字符串。

## Grafana

在 Grafana Alerting 的 Webhook Contact point 中，将地址指向该告警源的 Webhook URL，并使用上游可配置的 HTTP 认证发送接入 Token 或额外共享密钥。

```json
{
  "receiver": "tocsin",
  "status": "firing",
  "title": "[FIRING:1] CheckoutLatencyHigh",
  "message": "Checkout latency is above threshold",
  "groupKey": "{}:{alertname=\"CheckoutLatencyHigh\"}",
  "commonLabels": {
    "alertname": "CheckoutLatencyHigh",
    "service": "checkout",
    "severity": "critical"
  },
  "commonAnnotations": {
    "summary": "Checkout latency high"
  },
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "instance": "checkout-api-1",
        "severity": "critical"
      },
      "annotations": {
        "description": "p95 latency is above 2s"
      },
      "startsAt": "2026-10-27T07:59:00Z",
      "endsAt": "0001-01-01T00:00:00Z",
      "fingerprint": "grafana-fingerprint-1"
    }
  ]
}
```

Grafana 解析器会合并 `commonLabels` 与首条 alert 的 labels。title 的优先级为顶层 `title`、common annotation summary、首条 alert annotation summary、`labels.alertname`；message 优先取顶层 `message`，再取首条 alert 的 annotations。severity、status、occurredAt 与 fingerprint 的选择规则与 Alertmanager 兼容载荷一致。

## Uptime Kuma

创建 Uptime Kuma 通知并选择 Webhook 类型，将 URL 指向该告警源的 Webhook URL。代表性载荷：

```json
{
  "msg": "[Tocsin API] is down",
  "monitor": {
    "id": 42,
    "name": "Tocsin API",
    "type": "http",
    "url": "https://status.example.test/health"
  },
  "heartbeat": {
    "status": 0,
    "msg": "timeout",
    "time": "2026-10-27T07:57:00Z"
  }
}
```

Uptime Kuma 的 heartbeat `status` 按以下方式映射：

| 上游状态 | 规范化 status | severity | 说明 |
| --- | --- | --- | --- |
| `0` / DOWN | `firing` | `critical` | 确认中的故障才进入 critical 路由 |
| `1` / UP | `resolved` | `info` | 恢复通知 |
| `2` / PENDING | `unknown` | `info` | 重试待定，不升级成 critical |
| `3` / MAINTENANCE | `unknown` | `info` | 维护窗口，不升级成 critical |
| 其他数值或缺失 | `unknown` | `info` | 不猜测为故障 |

title 缺省时由 monitor 名称和规范化 status 生成；message 优先取顶层 `msg`。fingerprint 优先使用 monitor ID，其次使用名称或 URL。解析器还会生成 `monitor`、`monitor_id`、`monitor_path`、`url`、`type`、`response_time_ms`、`last_down_at` 等安全运维 labels。

若 Route 只匹配 `status=firing`，Pending 与 Maintenance 心跳不会命中。需要审计这类状态时，应额外匹配 `status=unknown`，而不是放宽 critical 路由。

## FastGPT 模型探测

FastGPT 使用独立探测契约，不是通用告警格式。创建 `FastGPT 模型探测` 告警源后，在 FastGPT 侧配置：

- `webhookUrl`：该告警源的完整接入 URL。
- `webhookToken`：该告警源的接入 Token，以 `Authorization: Bearer` 发送。

```json
{
  "event": "model_status_error",
  "status": "red",
  "model": {
    "modelId": "model-6a995e65",
    "model": "speech-01-turbo",
    "name": "speech-01-turbo",
    "provider": "MiniMax",
    "type": "tts"
  },
  "probe": {
    "attempts": 4,
    "error": "500 upstream timeout",
    "requestEndedAt": "2026-10-27T07:25:10.391Z"
  }
}
```

支持的 `event`：

| event | 规范化 status | 典型 severity |
| --- | --- | --- |
| `model_status_error` | `firing` | `red` → `critical`；`yellow` → `warning` |
| `model_status_recovered` | `resolved` | `green` → `info` |

`model.modelId` 必填；fingerprint 固定为 `fastgpt:<modelId>`。未知 probe 颜色保留为 `severity=unknown`，但 event 仍分别规范化为 firing 或 resolved。缺少 `event`、缺少 `modelId` 或使用不支持的事件时会返回 `400`，并把解析失败证据保存到 Event。

探测错误会经过脱敏；出现凭据形态的文本时，整段错误可能显示为 `probe error redacted`。不要把上游 API key、Authorization header 或完整错误响应复制到工单。

## 接入验收

1. 从上游发送一条不含生产敏感信息的代表性载荷，确认 HTTP `202` 与 `eventId`。
2. 在 Events 打开该 Event，核对 title、message、severity、status、labels、fingerprint 与 occurredAt。
3. 在 Event 详情查看 route matches，确认条件与实际规范化值一致。
4. 在 Deliveries 核对目标、状态与尝试记录；没有 Delivery 时先检查 Route 和目标是否启用。
5. 若收到 `400`，使用响应中的 `eventId` 打开解析失败 Event，再修正上游载荷或告警源 Provider。

相关页面：[Provider 接入验收配方](/integrations/provider-verification) · [快速开始](/guide/quick-start) · [处理链路与概念](/guide/concepts) · [通知目标参考](/integrations/destinations) · [故障排查](/operations/troubleshooting)
