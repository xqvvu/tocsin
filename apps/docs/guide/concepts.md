# 处理链路与概念

Tocsin 把告警接收与通知发送分开处理，便于定位「收到什么、为何匹配、发送到了哪里、结果如何」。

```text
告警源 Source → Webhook → Event → Route → Destination → Delivery → Worker
```

| 概念 | 运维含义 | 排障入口 |
| --- | --- | --- |
| 告警源（Source） | 一个上游发送方及其 Provider 解析器；每个告警源独立认证，可单独禁用或轮换 Token。 | [告警源生命周期](/guide/sources)与一次性 Token 提示 |
| Event | 每次通过认证的入站请求及其规范化结果。不同 Provider 的 payload 被映射为共同告警字段。 | [事件检索与证据](/guide/events)中的 normalized fields、原始调试信息与 route matches |
| Route | 用 source、severity、status、labels、title 或 message 条件匹配事件，并指定一个或多个通知目标。规则可检查，不执行任意代码。 | 路由列表与事件详情中的匹配证据 |
| Destination | 一个出站通知渠道及其端点、模板和凭证配置。凭证保留在服务端；目标可测试、启停。 | 通知目标配置与测试结果 |
| Delivery | 一次向指定目标发送的工作记录，包含状态、尝试次数、错误与重试信息。 | [投递检索、生命周期与重试](/operations/deliveries)与 attempt history |
| Suppression | 有范围和时间窗的临时静默或维护时段。事件仍会记录，命中的 Delivery 标为 `suppressed` 且不发送。 | [告警静默与维护时段](/operations/suppressions)与投递详情 |
| Integration | 可复用的外部应用资源。目前包括飞书应用，供应用发送模式与可选电话加急使用。 | [飞书应用与电话加急](/integrations/feishu-app)及相关投递详情 |

## Provider 与 Destination

当前 Provider parser：Generic Webhook、SigNoz、Grafana、Uptime Kuma、Alertmanager、FastGPT 模型状态探测。当前 Destination sender：通用 Webhook、Feishu、Slack、Email（experimental）。Provider 负责解析入站 payload；Destination 负责发送出站消息，两者不应混为一类配置。通知目标的字段、模板与测试语义见[通知目标参考](/integrations/destinations)。

Provider 会生成规范化字段，如标题、消息、严重程度、状态、fingerprint、labels 和发生时间。路由使用这些字段而不是每个上游系统的私有格式。具体 Provider 的配置界面通常不需要额外字段，但 payload 字段约定因适配器而异。各上游的字段选择、示例载荷与响应码见[告警源接入参考](/integrations/providers)。

## 接收与投递语义

- Webhook 使用告警源 Token，或该告警源配置的额外共享密钥进行认证；当前实现接受任一有效凭据，不要求两者同时提供。浏览器 dashboard session 与 webhook 认证彼此独立，细节见[认证与账号安全](/operations/authentication)。
- Event 记录接收事实；告警 fingerprint 表示告警身份，不能替代请求幂等键。重复 webhook 请求可保留 Event 供审计，同时在短幂等窗口内避免重复创建投递。
- Webhook 被接受后，投递由 SQLite 支撑的进程内 Worker 异步执行。`202 Accepted` 只表示接入已接受，不代表目标已送达。
- Delivery 可能处于 `pending`、`running`、`succeeded`、`failed` 或 `suppressed`。失败记录可自动退避重试，也可在详情页手动重试；创建时即被抑制的投递没有发送尝试，重试退避中被抑制的记录会保留既有尝试但不再发送。状态、退避、暂停和积压处置见[投递检索、生命周期与重试](/operations/deliveries)。
- 原始 payload 的保留期可在设置中调整；Delivery history 当前不会自动清理。清理触发边界、SQLite 空间指标与容量处置见[数据保留与 SQLite 容量](/operations/data-retention)。

::: warning 单实例边界
默认运行形态是一个 Tocsin 进程与一个本地 SQLite 文件。它不是多副本集群；不要让多个实例共享同一个 SQLite 文件，也不要把数据库放在不适合 SQLite 的网络文件系统上。
:::

更多：[告警源接入与生命周期](/guide/sources) · [快速开始](/guide/quick-start) · [路由规则与匹配](/guide/routes) · [通知目标参考](/integrations/destinations) · [告警静默与维护时段](/operations/suppressions) · [Docker 部署与持久化](/operations/deploy-docker)
