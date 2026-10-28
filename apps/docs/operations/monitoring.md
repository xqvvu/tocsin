---
title: 生产监控与告警基线
description: 为单实例 Tocsin 建立外部探针、日志告警、容量与备份检查，并验证值班通知链路。
---

# 生产监控与告警基线

Tocsin 当前不提供 Prometheus/OpenTelemetry metrics endpoint、内置告警引擎或历史指标库。`/api/health`、`/api/ready`、运行日志和 dashboard 只提供观测信号；采集、聚合、通知与升级必须由部署方的监控系统完成。

本页给出一套面向单实例部署的最小生产基线。阈值是起步建议，不是 Tocsin 内置默认值；上线两周后应按真实流量和目标重要性调整。进程、SQLite、Worker 与外部依赖的故障边界见[单实例架构与故障边界](/operations/architecture)，日志字段、请求关联和脱敏边界见[日志与可观测性](/operations/observability)，故障处置顺序见[故障排查](/operations/troubleshooting)。

::: danger 不要用 Tocsin 自己监控 Tocsin
如果把实例不可用、最终投递失败或磁盘告警发送到同一个 Tocsin 实例，那么该实例故障时监控和被监控对象会一起失效。Tocsin 自身的告警必须走独立的监控与通知链路。
:::

## 最小信号集

至少覆盖“进程是否活着、实例是否可服务、后台队列是否推进、消息是否最终送达、宿主机是否仍有容量、备份是否可恢复”六类问题。

| 信号与来源 | 起步规则 | 值班判读 |
| --- | --- | --- |
| 外部 readiness：独立探针请求 `/api/ready`，每 30–60 秒一次 | 连续 2 次非 `200` 或在 2 分钟内持续失败即通知；只有 `200` 且 `status: "ok"` 通过 | 覆盖 TLS、代理、应用、SQLite、迁移和 Worker |
| 进程 liveness：`/api/health`，每 30–60 秒一次 | 连续 3 次非 `200` 即通知；与 readiness 合并处理 | 只证明进程能响应，不证明数据库或 Worker 正常 |
| 容器状态：Docker/Kubernetes | `unhealthy` 持续 2 分钟，或 30 分钟内重启超过 3 次即通知 | 健康检查失败不会让 `restart: unless-stopped` 自动重启 |
| Worker 基础设施错误：`tocsin.worker.*` 的 `ERROR` | 首条错误建工单；15 分钟内 2 次或持续出现即通知 | 后台队列本身无法运行，继续堆积也不会恢复 |
| 投递最终失败：`tocsin.delivery` 的 `outcome="failed"` | 值班目标 1 条即升级；非值班目标先建工单并聚合 | 重试已耗尽或不可重试，消息未被目标接受 |
| 成功状态未记录：`tocsin.delivery` 的 `ERROR` | 任意 1 条即通知值班 | 目标可能已收到，但 Tocsin 无法确认；禁止盲目重试 |
| 电话加急最终失败：`tocsin.oncall` | 最终 `failed` 或“已拨出但记录失败”即通知 | 电话可能未接通或状态未知；先核实接收人 |
| 入站认证与解析异常：`tocsin.intake` | 同一 `sourceId` 10 分钟内 5 条异常即建工单 | Token 轮换错误、来源停用或格式变化可能导致静默漏告警 |
| 数据卷剩余空间：宿主机或 Kubernetes volume | 剩余低于 20% 警告，低于 10% 通知；同时设绝对下限 | SQLite、WAL、日志和备份共享磁盘，写满后接入与投递都会失败 |
| 备份新鲜度：备份任务与校验结果 | 24 小时内无成功备份、文件为空或校验失败即建工单 | “任务存在”不等于可恢复，还需按[恢复后验收清单](/operations/backup-restore#恢复后验收清单)定期演练 |
| TLS 证书有效期：HTTPS 或证书监控 | 剩余 14 天警告，剩余 3 天通知值班 | 证书过期会让 dashboard 和 Webhook 同时不可用 |

`/api/ready` 的 `code` 用于排障，不应被普通 HTTP 黑盒探针忽略。探针先按状态码触发，再在工单或告警正文中带上 `checks` 与 `code`；各错误码的含义见[日志与可观测性](/operations/observability#健康检查、worker-状态与投递健康)。

## 配置外部探针

外部探针应从与 Tocsin 不同的故障域运行，并直接访问用户实际使用的规范域名。Docker 内部的 `127.0.0.1:3000/api/ready` healthcheck 只能证明容器内应用可服务，不能覆盖 DNS、TLS、反向代理和外部网络。

先用以下命令确认代理后的响应：

```bash
curl -sS -o /tmp/tocsin-ready.json \
  -w 'HTTP %{http_code}\n' \
  https://tocsin.example.com/api/ready
jq '{status, checks, code}' /tmp/tocsin-ready.json
```

成功的 readiness 响应是 HTTP `200` 与 `{"status":"ok",...}`。HTTP `503` 表示 SQLite、迁移或 Worker 检查失败；启动期的其他失败也可能表现为非 `200`。探针不要接受 `3xx`、`4xx` 或 `5xx` 为正常状态，也不要只检查 TCP 端口。

- 对 `/api/health` 和 `/api/ready` 设置独立的请求超时，例如 5 秒。
- 对同一故障造成的 liveness、readiness 和容器 unhealthy 告警做抑制，避免一次实例故障触发三组重复通知。
- 计划升级或维护时使用有时限的静默，并在维护结束后立即恢复探针；不要让静默自动续期。
- 如果监控系统只能从 Tocsin 同一台主机探测，仍需补一个云拨测、独立节点或外部 uptime 服务，否则主机断电时无人收到告警。

## 从 JSON 日志建立告警

生产镜像使用 JSON Lines。采集端应索引 `level`、`logger`、`properties` 等字段，不要匹配自然语言 `message`。下面的命令用于在本机核对最终失败和 Worker 基础设施错误：

```bash
docker compose logs --no-log-prefix --since=15m console \
  | jq -R 'fromjson?
    | select(
        (.logger == "tocsin.delivery" and .properties.outcome == "failed")
        or ((.logger | startswith("tocsin.worker.")) and .level == "ERROR")
      )
    | {timestamp: .["@timestamp"], level, logger, properties}'
```

告警规则建议：

- `tocsin.delivery` 的 `properties.outcome="retrying"` 是正常退避，不要按最终失败通知值班。
- 按 `deliveryId` 去重；按 `destinationId`、`destinationKind` 和 `errorKind` 聚合趋势。不要把 `errorMessage` 当作长期标签，它只用于已脱敏的排障上下文。
- `tocsin.worker.delivery` 的批次 `WARN` 可能与逐条最终失败重复。先以逐条 `tocsin.delivery` 最终失败作为投递信号，把 Worker 批次行用于确认队列是否仍在推进。
- 空批次不会输出 Worker 摘要。没有 `tocsin.worker.*` 日志不等于 Worker 停止了，不能把“日志静默”直接当成故障。
- 对日志采集器本身配置磁盘上限、背压和停止上报告警；日志管道失效时不能继续假设监控有效。

## 用 Canary 覆盖完整链路

外部探针只能证明 HTTP 可服务，不能证明“Webhook 接入 → 路由 → 投递”仍然工作。建议配置低频、不会触发真实值班电话的端到端 canary：

1. 创建专用告警源、专用路由和专用通知目标。
2. 通知目标只发送到监控团队控制的测试频道或测试 Webhook，不要复用生产值班渠道。
3. 由独立调度器定时发送唯一标题的测试载荷，例如每 15 分钟或每小时一次。
4. 接收端在约定窗口内没有收到消息时告警，并到 dashboard 核对对应 Event 与 Delivery。
5. 为 canary 数据设置固定命名和容量检查，避免测试事件无限增长。

这项能力需要部署方自行编排，Tocsin 当前没有内置 synthetic monitor。启用前应确认 canary 的路由条件不会命中真实通知目标，尤其是飞书电话加急。

## Dashboard 巡检

dashboard 适合人工复核，但不能代替外部探针。每个班次至少检查：

| 位置 | 检查什么 |
| --- | --- |
| 设置 → 后台工作进程 | 投递与加急 Worker 均不是 `失败`；`未启动` 时核对启动与 readiness |
| 通知目标列表 | 最近成功与失败时间、排队数量、近 24 小时失败数；长期排队或只有失败的目标要下钻 |
| 投递列表 | 使用 `failed` 与 `24h` 筛选复核最终失败；确认失败记录都有负责人和后续动作 |
| 设置 → 数据库存储 | 数据库体积、可回收空间、历史行数和最老/最新 Event 的变化趋势 |
| 宿主机与备份系统 | 数据卷余量、WAL 与备份文件、最近一次成功备份和恢复演练记录 |
| 页头状态徽标 | 出现「投递失败」「出站投递已暂停」或「生效中的静默」时点开对应链接核实，不要只看数字 |

值班目标近 24 小时失败、电话加急最终失败或 Worker 进入 `失败` 时，不应只做“刷新后消失”的处理。先确认是否有告警丢失，再修复配置或重试可安全重试的投递。

班次交接时，把暂停状态、生效静默、停用对象、积压与失败数量整理成快照，并按[值班交接与通知链路验收](/operations/oncall-handoff)做一次目标测试或 canary。巡检只能证明“看过”，交接还要证明“下一个班次知道该看什么”。

### 页头运行态指示器

dashboard 每个页面的页头右侧都可能出现状态徽标。它们只在条件成立时显示，都是到处置页面的链接；颜色和文案本身就表达结论，不要只记数字。

| 徽标 | 出现条件 | 点击去向 |
| --- | --- | --- |
| 出站投递已暂停（红色） | 实例级「暂停出站投递」开启 | 投递页；恢复入口在设置页 |
| 投递失败：N 条（红色） | 最近 24 小时内创建、当前状态为 `failed` 的投递多于 0 条 | `/deliveries?deliveryState=failed&range=24h` |
| 生效中的静默：N 条（描边） | 当前时刻有生效的静默规则 | 静默页的「生效中」筛选 |
| 全量静默生效中（红色） | 生效规则中存在匹配条件为空的全量静默 | 静默页的「生效中」筛选 |

投递失败徽标的计数口径：

- 只统计**最近 24 小时内创建**、且**当前状态仍为 `failed`** 的投递。超过 24 小时仍失败的投递不计入，也不累计历史失败次数。
- `pending`、`running`、`succeeded`、`suppressed` 都不计入。「目标已受理但记录成功失败」的投递仍处于 `failed`，会计入并在详情中禁用重试。
- 徽标每 60 秒重新查询一次，数字最多滞后约一分钟。手动重试会把投递改回 `pending`，它随即从计数中消失，即使此前确实失败过。
- 首次加载或查询失败时徽标不会出现，也不会显示错误提示。**没有徽标不等于 24 小时内没有失败**；需要确认时打开投递页使用 `failed` + `24h` 筛选，或用 `tocsin.delivery` 的最终失败日志核对。

暂停徽标是实例级状态：它出现在任何页面，避免暂停只在设置页可见；点击回到投递页。通知目标的测试动作绕过队列；电话加急使用独立队列，但排队中的投递被暂停时，其自动加急会推迟到恢复之后。处置顺序见[投递生命周期与重试](/operations/deliveries#全局暂停出站投递)。

静默徽标只统计**当前时刻**真正生效的规则：尚未开始、已过期或已停用的规则都不计入。存在全量静默时，文案固定为红色「全量静默生效中」，优先于计数；有规则将在 30 分钟内到期时，徽标追加「N 条 30 分钟内到期」，悬停可看到生效规则名称。徽标在浏览器挂载后才计算，首屏可能短暂不显示。核对与处置见[告警静默与维护时段](/operations/suppressions#核对与审计)。

::: warning 页头徽标不是监控通道
三个徽标都是人工巡检提示：查询失败时静默、计数有时间窗和刷新滞后，也不会把页面异常推送给任何人。实例级告警仍必须来自外部探针、日志告警和 canary。
:::

窄屏下三个徽标只显示图标，文字被隐藏；图标保留无障碍标签，点开链接后才能确认具体数量与去向，不要只凭图标猜测。

## 告警处置入口

| 信号 | 首先确认 | 下一步 |
| --- | --- | --- |
| `/api/ready` 返回 `store_unavailable` | 数据卷挂载、写权限、磁盘余量 | 保护数据库并按[故障排查](/operations/troubleshooting)处理，不要删除 SQLite 文件 |
| `/api/ready` 返回 `migration_failed` 或 `migration_unknown` | 当前镜像版本、发布记录、`schema_migrations` 台账 | 按[版本升级与回滚](/operations/upgrade-rollback)处置，不要手改 migration 台账 |
| `/api/ready` 返回 `worker_unavailable` | 启动日志、`tocsin.worker.*` 错误、设置页 Worker 状态 | 修复启动错误；仅重启进程不能解决持续的数据或配置故障 |
| 最终投递失败 | 目标测试、凭证、网络、模板和尝试记录 | 按[投递生命周期与重试](/operations/deliveries)决定修复与手动重试 |
| 成功但状态未记录 | 目标端是否已经收到消息 | 先核实目标；不要重试，避免重复通知 |
| 入站 `invalid_token` 或 `source_disabled` | 最近一次 Token/来源变更、上游配置 | 按[告警源接入与生命周期](/guide/sources)核对，不在工单记录 Token 明文 |
| 电话最终失败 | 接收人、飞书应用状态、加急记录与平台错误码 | 按[飞书应用与电话加急](/integrations/feishu-app)核实后再决定人工补呼 |
| 磁盘持续下降 | 数据卷总量、WAL、日志、备份和表行数 | 按[数据保留与 SQLite 容量](/operations/data-retention)处理容量 |
| 告警风暴或大面积误报 | Event / Delivery 增速、涉及的目标与是否已有电话加急 | 按[告警风暴与大面积误报的处置顺序](/operations/incident-playbook)选择最窄的急停手段，不要先删除配置 |

## 上线验收

监控配置完成后，不要只看“规则已保存”。至少完成以下验收：

- [ ] 从独立故障域请求 `/api/health` 与 `/api/ready`，确认只有 `200` 会通过。
- [ ] 在测试环境制造探针失败，确认告警能送到独立于 Tocsin 的值班渠道，并验证恢复通知。
- [ ] 在测试环境用不可达的通用 Webhook 目标制造最终投递失败，确认 `deliveryId`、`destinationId` 与 `errorKind` 出现在告警中。
- [ ] 确认告警不会因为正常的 `outcome="retrying"`、空 Worker 批次或 202 接入而误报。
- [ ] 配置数据卷余量、TLS 到期、备份失败和备份过期告警，并各触发一次测试。
- [ ] 完成一次恢复演练，确认备份文件可恢复、`/api/ready` 正常且最近 Event 与 Delivery 可读。
- [ ] 记录每条告警的所有者、runbook、静默上限和升级路径；无人负责的告警等同未配置。

::: info 当前能力边界
Tocsin 不提供长期 metrics、队列深度 API、浏览器错误上报、自动备份、证书管理或 synthetic monitor。设置页 Worker 状态是进程内快照，容器重启后会清空；投递健康只覆盖通知目标列表展示，不是 Prometheus exporter。需要这些能力时，应在外部监控系统实现，不要把 dashboard 当作唯一数据源。
:::

相关页面：[单实例架构与故障边界](/operations/architecture) · [日志与可观测性](/operations/observability) · [故障排查](/operations/troubleshooting) · [投递生命周期与重试](/operations/deliveries) · [Docker 生产部署](/operations/deploy-docker) · [TLS 反向代理](/operations/reverse-proxy) · [数据保留与 SQLite 容量](/operations/data-retention) · [备份与恢复](/operations/backup-restore) · [版本升级与回滚](/operations/upgrade-rollback) · [告警源接入与生命周期](/guide/sources) · [飞书应用与电话加急](/integrations/feishu-app)
