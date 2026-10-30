---
title: Provider 接入验收配方
description: 使用可复制的最小载荷验证 Grafana、Alertmanager、SigNoz、Uptime Kuma、FastGPT 与通用 Webhook 的接入和解析。
---

# Provider 接入验收配方

这份配方用于在启用 Route 前验证三件事：Webhook URL 可达、告警源凭据有效、所选 Provider 能把上游载荷规范化为预期字段。它不验证通知目标，也不会证明 `202` 之后一定产生了 Delivery。

::: warning 使用隔离的测试告警源
先使用专用、非生产告警源发送不含真实主机名、Token 或业务数据的测试载荷。可以暂不配置已启用的 Route，这样验收只会产生 Event，不会触发生产通知。需要验证完整链路时，再使用独立测试目标与 Route。
:::

::: tip 也可以先用接入预演验证解析、路由与投递判定
如果上游尚未接入，或不想为了验收先写入 Event，可在「告警源」页使用[接入预演](/guide/sources#接入预演)，粘贴下面的代表性请求体并按当前解析器与路由规则回放，同时查看每个命中目标此刻会送达、被静默、目标停用还是排队等待恢复。它不写 Event、不创建 Delivery、不发送通知，也不校验 Token 与网络可达性；认证和 `202` 响应仍要用真实请求验证。
:::

告警源创建、Token 一次性显示和轮换语义见[告警源接入与生命周期](/guide/sources)。完整字段优先级和上游配置说明见[告警源接入参考](/integrations/providers)。

## 先分清响应

| 响应 | 发生阶段 | 是否生成 Event | 运维含义 |
| --- | --- | --- | --- |
| `401` / `403` / `404` | 凭据或告警源状态校验 | 否 | 先修 URL、Token、共享密钥或启停状态，不要继续调整 payload |
| `400`，响应没有 `eventId` | JSON 解码 | 否 | 请求体为空或不是有效 JSON；先检查上游模板、转义和代理层 |
| `400`，响应带 `eventId` | Provider 解析 | 是，解析失败 Event | payload 是有效 JSON，但当前 Provider 不接受；按 `eventId` 打开 Event 查看原因 |
| `202` | 接入事务提交 | 是 | Provider 已接受；先看 `routesMatched` 判断是否命中启用的路由，再看 `deliveriesCreated` / `deliveriesDeduped` |
| `413` | 请求体大小校验 | 否 | 检查 `TOCSIN_MAX_WEBHOOK_BYTES` 与反向代理上限 |

`202` 中的 `deliveriesCreated: 0` 并不表示接入失败。先看同一响应里的 `routesMatched`：

- `routesMatched: 0`：没有启用的 Route 命中。检查路由规则（severity、label、文本条件）、路由是否绑定该告警源，以及路由是否被停用。
- `routesMatched > 0` 且 `deliveriesDeduped > 0`：相同幂等键仍在去重窗口内，重复送达已被拦截，属于预期行为。
- `routesMatched > 0` 且 `deliveriesCreated > 0`：Delivery 已入队（包括立即被抑制的记录）。目标停用不会阻止创建：记录保持 `pending`，Worker 会等目标重新启用后再领取。

Route 始终至少保留一个通知目标：删除最后一个目标时该 Route 会被一并删除，因此「命中路由、却既没有创建 Delivery 也没有去重」不会出现在成功回执里。

## 通用验证命令

先取得告警源 URL 与一次性显示的接入 Token，再执行：

```bash
export TOCSIN_WEBHOOK_URL='https://tocsin.example.com/api/sources/<source-id>/webhook'
export TOCSIN_SOURCE_TOKEN='<source-token>'

curl --silent --show-error --include \
  --request POST "$TOCSIN_WEBHOOK_URL" \
  --header "Authorization: Bearer $TOCSIN_SOURCE_TOKEN" \
  --header 'Content-Type: application/json' \
  --data-binary @- <<'JSON'
{
  "id": "tocsin-generic-verification-20261028",
  "fingerprint": "tocsin-generic-verification",
  "title": "Tocsin generic webhook verification",
  "message": "Synthetic verification payload",
  "severity": "warning",
  "status": "firing",
  "labels": {
    "service": "tocsin-verification",
    "environment": "test"
  },
  "occurredAt": "2026-10-28T02:00:00Z"
}
JSON
```

成功响应至少应包含：

```json
{
  "accepted": true,
  "eventId": "event-...",
  "routesMatched": 1,
  "deliveriesCreated": 0,
  "deliveriesDeduped": 0
}
```

后续示例只替换请求体。每次测试使用不同的 `id`、`fingerprint` 或上游 alert identity，避免把“相同请求的去重”误判成“解析失败”。

## 预期规范化结果

以下最小载荷用于确认 Provider 选择正确。生产载荷通常还包含更多字段。

| Provider | Event 标题 | severity / status | fingerprint 来源 |
| --- | --- | --- | --- |
| Generic Webhook | `Tocsin generic webhook verification` | `warning` / `firing` | 载荷中的 `fingerprint` |
| Grafana | `[FIRING:1] TocsinGrafanaVerification` | `warning` / `firing` | 首条 alert 的 `fingerprint` |
| Alertmanager | `TocsinAlertmanagerVerification` | `warning` / `firing` | 首条 alert 的 `fingerprint` |
| SigNoz | `TocsinSigNozVerification` | `warning` / `firing` | 首条 alert 的 `fingerprint` |
| Uptime Kuma | `Tocsin verification is firing` | `critical` / `firing` | `uptime_kuma:` + monitor ID |
| FastGPT 模型探测 | `Tocsin verification model probe failed` | `critical` / `firing` | `fastgpt:` + `modelId` |

## Generic Webhook

Generic Provider 推荐发送 JSON 对象，并按下方字段提取告警。其他 JSON 类型不会被拒绝，但不会提取标题、标签或告警字段，只会生成默认 Event；因此“收到 `202`”不等于字段映射正确。

使用上方通用验证命令时，应核对：

- Event 标题为 `Tocsin generic webhook verification`；
- labels 包含 `service=tocsin-verification` 与 `environment=test`；
- fingerprint 为 `tocsin-generic-verification`；
- Event 的 `occurredAt` 为 `2026-10-28T02:00:00.000Z`。

若事件正常生成但标题为 `Generic webhook event`，先检查请求体是否为对象、字段名是否遵循[Generic Webhook 字段约定](/integrations/providers#generic-webhook)。若返回带 `eventId` 的 `400`，先核对告警源实际选择的 Provider；Generic Webhook 本身通常不会因字段不完整而拒绝有效 JSON。

## Grafana

在 Grafana Alerting 的 Webhook Contact point 中填写告警源 URL，并把通知策略指向该 contact point。HTTP 认证使用 `Authorization: Bearer <source-token>`，或该告警源已配置的 `X-Tocsin-Provider-Secret`。

代表性最小载荷：

```json
{
  "receiver": "tocsin-verification",
  "status": "firing",
  "title": "[FIRING:1] TocsinGrafanaVerification",
  "message": "Synthetic Grafana verification alert",
  "groupKey": "{}:{alertname=\"TocsinGrafanaVerification\"}",
  "commonLabels": {
    "alertname": "TocsinGrafanaVerification",
    "service": "tocsin-verification",
    "severity": "warning"
  },
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "instance": "test-instance",
        "severity": "warning"
      },
      "annotations": {
        "description": "Synthetic Grafana verification alert"
      },
      "startsAt": "2026-10-28T02:00:00Z",
      "endsAt": "0001-01-01T00:00:00Z",
      "fingerprint": "tocsin-grafana-verification"
    }
  ]
}
```

验收时还要在 Event 的上游元数据中看到 `alertCount=1`、`receiver=tocsin-verification` 和对应的 `groupKey`。Grafana Provider 只规范化首条 alert；测试时使用单条 alert，避免把“多告警组只取第一条”误判为丢数据。

若返回带 `eventId` 的 `400`，优先查看解析失败 Event 的错误。Grafana Provider 要求请求体是 JSON 对象；对象字段不完整时可能仍返回 `202`，但 Event 会使用默认标题、`unknown` severity 或空 labels。

## Alertmanager

在 Alertmanager 的 webhook receiver 中填写告警源 URL，并配置 Bearer Token 或该告警源的共享密钥。建议同时启用 resolved 通知，否则恢复事件需要依赖其他通知链路。测试时使用单条 alert：

```json
{
  "version": "4",
  "receiver": "tocsin-verification",
  "status": "firing",
  "groupKey": "{}:{alertname=\"TocsinAlertmanagerVerification\"}",
  "externalURL": "https://alertmanager.example.com",
  "commonLabels": {
    "alertname": "TocsinAlertmanagerVerification",
    "service": "tocsin-verification",
    "severity": "warning"
  },
  "commonAnnotations": {
    "summary": "Synthetic Alertmanager verification alert"
  },
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "instance": "test-instance",
        "severity": "warning"
      },
      "annotations": {
        "description": "Synthetic Alertmanager verification alert"
      },
      "startsAt": "2026-10-28T02:00:00Z",
      "endsAt": "0001-01-01T00:00:00Z",
      "fingerprint": "tocsin-alertmanager-verification"
    }
  ]
}
```

预期标题取自合并后的 `labels.alertname`，message 优先取首条 alert 的 description，fingerprint 取首条 alert 的 `fingerprint`。`alertCount=0` 表示 `alerts` 缺失或没有对象项；此时即使返回 `202`，规范化结果也缺少应有的告警上下文。

## SigNoz

选择 `SigNoz` Provider，而不是 `Alertmanager`，即使两者共享兼容载荷形状。Webhook 目标应发送 Alertmanager 兼容 JSON，认证方式与其它 Provider 相同。

```json
{
  "receiver": "tocsin-verification",
  "status": "firing",
  "groupKey": "{}:{alertname=\"TocsinSigNozVerification\"}",
  "commonLabels": {
    "alertname": "TocsinSigNozVerification",
    "service": "tocsin-verification",
    "severity": "warning"
  },
  "commonAnnotations": {
    "summary": "Synthetic SigNoz verification alert",
    "description": "Synthetic SigNoz verification alert"
  },
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "instance": "test-instance",
        "severity": "warning"
      },
      "annotations": {
        "description": "Synthetic SigNoz verification alert"
      },
      "startsAt": "2026-10-28T02:00:00Z",
      "fingerprint": "tocsin-signoz-verification"
    }
  ]
}
```

预期标题为 `TocsinSigNozVerification`，provider metadata 中的 `provider` 必须是 `signoz`。如果 provider 仍显示 `alertmanager`，说明告警源创建或编辑时选错了 Provider；历史 Event 不会因切换 Provider 而重算。

## Uptime Kuma

在 Uptime Kuma 中创建 Webhook 通知并填写告警源 URL。上游版本若支持自定义 HTTP Header，使用 `Authorization: Bearer <source-token>`；否则可发送 `X-Tocsin-Source-Token`。代表性 DOWN 心跳：

```json
{
  "msg": "[Tocsin verification] is down",
  "monitor": {
    "id": 20261028,
    "name": "Tocsin verification",
    "type": "http",
    "url": "https://example.com/health"
  },
  "heartbeat": {
    "status": 0,
    "msg": "Synthetic timeout",
    "time": "2026-10-28T02:00:00Z",
    "ping": 250
  }
}
```

预期 fingerprint 为 `uptime_kuma:20261028`，labels 包含 `monitor`、`monitor_id`、`url`、`type` 与 `response_time_ms`。Uptime Kuma 的数值 heartbeat 状态映射为：

| `heartbeat.status` | 规范化 status | severity |
| --- | --- | --- |
| `0` | `firing` | `critical` |
| `1` | `resolved` | `info` |
| `2`、`3` 或未知值 | `unknown` | `info` |

Pending 或 Maintenance 心跳不会进入 critical 路由。若仍收到 critical 自动加急，先确认 Event 的原始 payload 与 provider metadata，再检查是否有更早的 DOWN 事件仍在匹配。

## FastGPT 模型探测

FastGPT 使用严格的事件契约，不支持用普通告警字段替代。代表性失败事件：

```json
{
  "event": "model_status_error",
  "status": "red",
  "model": {
    "modelId": "tocsin-verification-model",
    "model": "tocsin-verification-model",
    "name": "Tocsin verification",
    "provider": "Tocsin",
    "type": "llm"
  },
  "probe": {
    "attempts": 1,
    "error": "Synthetic verification timeout",
    "requestEndedAt": "2026-10-28T02:00:00.000Z"
  }
}
```

预期 fingerprint 为 `fastgpt:tocsin-verification-model`，severity 为 `critical`，status 为 `firing`。缺少 `event`、缺少 `model.modelId` 或 event 不在 `model_status_error` / `model_status_recovered` 中时，Tocsin 会保存解析失败 Event 并返回带 `eventId` 的 `400`。

恢复事件应使用 `event: "model_status_recovered"` 与 `status: "green"`。未知 probe 颜色不会阻止 event 入库，但 severity 会保留为 `unknown`；不要在生产中依赖未知颜色触发 critical 路由。

## 验收记录

每个 Provider 至少完成以下检查：

1. HTTP 返回 `202`，且响应有 `eventId`。
2. Event 标题、severity、status、fingerprint 与本文预期一致。
3. Event 的 Provider metadata 与告警源所选 Provider 一致。
4. Raw payload 中没有 Token、Authorization、密码或生产敏感数据。
5. 暂不启用 Route 时，`deliveriesCreated` 为 `0`；启用隔离测试 Route 后，能看到匹配证据与测试 Delivery。若测试目标处于停用状态，Delivery 应显示为 `pending`，而不是被当成未创建。
6. 从真实上游发送一条脱敏 canary，确认网络、凭据与上游实际 payload 也通过，而不只是在 `curl` 中通过。

完成上游 canary 后，再逐步启用生产 Route 与 Destination。接入链路和通知链路分开验收，可以把 Provider、路由和目标故障分别定位。投递后续状态见[投递检索、生命周期与重试](/operations/deliveries)，失败路径见[故障排查](/operations/troubleshooting)。

相关页面：[告警源接入参考](/integrations/providers) · [告警源接入与生命周期](/guide/sources) · [事件检索与证据](/guide/events) · [路由规则与匹配](/guide/routes) · [通知目标参考](/integrations/destinations) · [故障排查](/operations/troubleshooting)
