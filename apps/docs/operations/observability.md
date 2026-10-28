---
title: 日志与可观测性
description: 面向 SRE 与运维人员：Tocsin 日志格式与级别、JSON Lines 字段、请求关联、日志类别、健康检查与 Worker 状态区分、脱敏边界与安全取日志方式。
---

# 日志与可观测性

Tocsin 是单实例、单进程服务。运行日志只写 stdout/stderr：不写入业务 SQLite，不默认创建本地日志文件，也不要求先部署日志系统。容器的日志驱动、systemd journal 或 Kubernetes 采集负责保存与轮转。

本页说明日志格式、级别、类别、请求关联和脱敏边界，以及如何把运行日志与 `/api/health`、`/api/ready`、设置页的 Worker 状态区分开。外部探针、日志告警阈值和值班验收见[生产监控与告警基线](/operations/monitoring)；按告警链路逐段排查的步骤见[故障排查](/operations/troubleshooting)；投递状态与重试语义见[投递生命周期与重试](/operations/deliveries)。

## 格式与级别

| 变量 | 取值 | 默认 | 行为 |
| --- | --- | --- | --- |
| `TOCSIN_LOG_FORMAT` | `auto` / `json` / `text` | `auto` | `auto` 在生产构建输出 JSON Lines，在开发模式输出带颜色的文本。 |
| `TOCSIN_LOG_LEVEL` | `trace` / `debug` / `info` / `warning` / `error` / `fatal` / `off` | `info` | 低于阈值的记录被丢弃；`off` 关闭 `tocsin.*` 业务日志，LogTape 自身的 meta 告警仍可能输出。 |

- Compose 在生产模式下显式传入 `info` / `auto`，完整范围与生效方式见[环境变量与运行时配置](/operations/configuration#日志)。
- 设置页「运行时与生效参数」里的「日志格式」显示配置原值。`auto` 不告诉你当前最终输出哪种格式；生产镜像下 `auto` 即 JSON Lines。
- 级别沿用 console 语义：`warning`、`error`、`fatal` 写入 stderr，`info`、`debug`、`trace` 写入 stdout。`docker compose logs` 会合并两路输出。
- 启动时 `tocsin.runtime` 会输出 `Logging initialized with … output at …`，可用来确认实际生效的格式与级别。

::: tip 临时提高日志级别
排障时可以临时设置 `TOCSIN_LOG_LEVEL=debug` 后重启容器，复现问题再调回 `info`。`debug` 会显著增加日志量，也会让成功的 `/api/health`、`/api/ready` 探测写入日志；不要长期开着。
:::

### JSON Lines 字段

每行一个 JSON 对象：

```json
{"@timestamp":"2026-10-28T03:54:31.000Z","level":"INFO","message":"Delivery d-123 succeeded via feishu","logger":"tocsin.delivery","properties":{"deliveryId":"d-123","attemptNumber":1,"eventId":"e-123","sourceId":"s-123","destinationId":"dest-123","destinationKind":"feishu","responseStatus":200}}
```

| 字段 | 含义 |
| --- | --- |
| `@timestamp` | ISO 8601 UTC 时间 |
| `level` | `TRACE`、`DEBUG`、`INFO`、`WARN`、`ERROR`、`FATAL`；`warning` 输出为 `WARN` |
| `message` | 已渲染的消息文本 |
| `logger` | 日志类别，点号连接，如 `tocsin.worker.delivery` |
| `properties` | 结构化字段；请求内产生的日志带 `requestId` |

采集端应按 `logger` 和 `properties` 做结构化筛选，不要匹配 `message` 文本。

## 请求关联

HTTP 中间件会为每个请求确定 request id：

- 优先使用请求头 `x-request-id`，其次 `x-correlation-id`；只接受匹配 `^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$` 的值，无效或缺失时生成 UUID。
- id 写入响应的 `x-request-id` 头，并以 `properties.requestId` 出现在该请求产生的所有日志行。
- 访问日志只记录 method、pathname、handlerType、status 和 durationMs；不记录 query、请求头、请求体或响应体。
- 状态码 `4xx` 记 `warning`，`5xx` 记 `error`。
- 成功的 `/api/health` 与 `/api/ready` 降到 `debug`：默认 `info` 下看不到这两条探测日志，这是正常的。

排查时先用响应头里的 id 定位整条链路：

```bash
docker compose logs --since=30m console | grep '"requestId":"<request-id>"'
```

```bash
docker compose logs --no-log-prefix --since=30m console \
  | jq -R 'fromjson? | select(.properties.requestId == "<request-id>")'
```

上游系统传入自己的 request id 时，Tocsin 会沿用并在响应头回写，便于跨系统串联。告警源 Token、共享密钥与原始请求头不会进入日志上下文。

## 日志类别

| 类别 | 记录内容 | 值班时看什么 |
| --- | --- | --- |
| `tocsin.runtime` | 启动、日志初始化、版本与运行时信息、SQLite 启动失败 | 实例无法启动、版本核对 |
| `tocsin.http` | 每个 HTTP 请求的完成状态 | 4xx/5xx、慢请求、Webhook 是否到达 |
| `tocsin.orpc` | 失败的 dashboard oRPC 调用：procedure、错误码、耗时 | 设置页或列表操作报错 |
| `tocsin.intake` | Webhook 接受、拒绝与解析失败 | 「为什么没有 Event」 |
| `tocsin.delivery` | 单条投递成功、失败、重试与目标结果 | 「为什么没有送达」 |
| `tocsin.worker.delivery` | 投递 Worker 的批次摘要与运行失败 | 队列是否在推进 |
| `tocsin.oncall` | 电话加急的入队、拨出、失败与退避 | 「为什么没有打电话」 |
| `tocsin.worker.oncall` | 加急 Worker 的批次摘要与运行失败 | 加急队列是否在推进 |

空批次不输出 Worker 摘要：日志里没有 `tocsin.worker.*` 行，通常只说明当时没有到期任务，不代表 Worker 停止了。

## 关键日志行

| 日志（分隔符省略） | 级别 | 关键字段 | 含义 |
| --- | --- | --- | --- |
| `Webhook accepted as event …` | info | `sourceId`、`provider`、`eventId`、`matchedRouteCount`、`createdDeliveryCount`、`dedupedDeliveryCount` | 入站已接受。创建数为 0 时检查路由匹配与幂等去重 |
| `Webhook payload rejected by … parser` | warning | `sourceId`、`provider`、`eventId`、`failureReason` | 载荷已存为解析失败 Event，但没有创建投递 |
| `Webhook intake rejected for source …` | warning | `sourceId`、`reason`、`provider` | 认证或来源校验失败；`reason` 为 `source_not_found`、`source_disabled` 或 `invalid_token` |
| `Delivery … succeeded via …` | info | `deliveryId`、`attemptNumber`、`destinationKind`、`responseStatus` | 目标已接受且结果已记录 |
| `Delivery … is retrying/failed via …` | warning | `outcome`、`errorKind`、`errorMessage`、`retryHint` | 发送失败；`outcome` 区分是否还会重试 |
| `Delivery … succeeded but could not be recorded` | error | `deliveryId`、`attemptId`、`errorName`、`errorMessage` | 目标已受理但成功状态没写入数据库；先向目标核实，不要盲目重发 |
| `Delivery worker completed with …` | info / warning | `claimed`、`reclaimed`、`succeeded`、`failed`、`retrying` | 非空批次摘要；有失败时为 `warning` |
| `Urgent call … fired for …` | info | `pingId`、`deliveryId`、`receiver` | 电话已拨出并记录 |
| `Urgent call … was placed but is recorded as failed` | warning | `pingId`、`receiver` | 电话可能已拨出但状态写入失败；先核实再决定是否人工补呼 |
| `oRPC … failed/rejected with …` | error / warning | `procedure`、`errorCode`、`durationMs` | dashboard 调用失败；4xx 为 `warning`，5xx 为 `error` |

`errorMessage` 已经过脱敏，仍应按内部排障材料处理。

## 健康检查、Worker 状态与投递健康

几个信号回答不同问题，不要互相替代。

| 信号 | 回答的问题 | 不回答的问题 |
| --- | --- | --- |
| `GET /api/health` | 进程能否响应 | SQLite、迁移、Worker 是否正常 |
| `GET /api/ready` | 数据库、迁移、Worker 是否就绪 | 目标是否可达、投递是否成功 |
| 设置页「后台工作进程」 | 本进程内投递与加急 Worker 最近是否运行、上一批结果、最后错误 | 跨重启历史、队列总量、目标健康 |
| 投递列表与详情 | 单条投递的状态、尝试与证据 | Worker 为什么没启动 |
| 运行日志 | 具体请求、投递与加急的结果和错误 | 长期趋势与容量规划 |

`/api/health` 只返回 `{"status":"ok"}`，用于判断进程能否响应；它不检查 SQLite、迁移或 Worker。启动阶段 SQLite 打开或迁移失败时，除 `/api/ready` 外的请求都会失败，`/api/health` 也不会返回 ok。

`/api/ready` 返回 `200` 或 `503`，响应体带 `checks.sqlite`、`checks.migrations`、`checks.worker`，失败时还带固定 `code`：

| `code` | 含义 | 下一步 |
| --- | --- | --- |
| `store_unavailable` | SQLite 无法打开 | 检查数据卷、权限与磁盘空间 |
| `migration_failed` | 迁移执行失败 | 保全数据库与日志，按[版本升级与回滚](/operations/upgrade-rollback#回滚决策)处置 |
| `migration_unknown` | 数据库包含当前版本不认识的迁移 | 可能是版本回退或镜像不匹配；按[升级兼容性](/operations/upgrade-rollback#兼容性模型)判断，不要直接修改 `schema_migrations` |
| `worker_unavailable` | 后台 Worker 无法启动 | 查看启动日志与 `tocsin.worker.*` 错误 |

::: warning 探针端点不校验登录
`/api/health` 与 `/api/ready` 不要求 dashboard session。就绪响应只返回固定摘要，不暴露数据库路径或迁移版本；仍应只在探针、内网或反向代理允许的来源暴露它们。
:::

设置页的「后台工作进程」是只读投影，只观察已经存在的 runner，不会启动 Worker。它并排显示「投递工作进程」与「加急工作进程」，每列包含状态（`未启动`、`空闲`、`运行中`、`失败`）、上次开始与完成时间、上一批的领取/回收/成功/失败/重试数量，以及脱敏后的最后错误。

判读要点：

- `未启动`：当前进程没有该 Worker 的 runner；确认容器是否正常完成启动并打开数据库。
- `空闲` + `尚未运行`：runner 已存在但还没有完成过一批，通常出现在刚启动或刚恢复时。
- `空闲` + 有上次完成时间：Worker 在轮询，没有到期任务也是正常结果。
- `失败`：先看「上次错误」，再到日志中按 `tocsin.worker.delivery` 或 `tocsin.worker.oncall` 搜索同一时间段。

Worker 健康是进程内状态，容器重启后会清空；它不是持久化的审计记录。队列为什么停滞、暂停开关和积压判读见[投递生命周期与重试](/operations/deliveries#队列滞留与积压)。

## 脱敏边界

日志采用两层防护：调用点只记录允许的稳定维度，sink 在格式化前再做一次递归脱敏。

调用点允许记录：

- request、event、delivery、attempt、source、destination 与 ping 的 id。
- provider、destination kind、失败原因、错误类型、重试提示。
- 数量、HTTP 状态码、耗时、尝试次数、severity 与 status。
- 已脱敏的错误消息，以及接收人、操作者标识（排障需要回答「谁被叫了」）。

不会记录：

- `Authorization`、cookie、告警源 Token、共享密钥、session token。
- 原始请求头、原始载荷、规范化消息全文。
- 告警源与通知目标配置、`secret_refs`、签名密钥、SMTP 密码、飞书应用凭证与 `tenant_access_token`。
- 渲染后的 payload、目标响应体、完整 URL 与 query。
- 原始 `Error` 对象、stack 和 cause；只保留安全的 error name 与 message。

sink 会把敏感键（如 `authorization`、`token`、`password`、`secret`、`apikey`）替换为 `[REDACTED]`，并处理嵌套对象、命名占位符和 Error。它是兜底，不是记录敏感对象的许可：调用点仍不得主动把 payload、请求头或配置塞进日志字段。

::: danger 不要把日志整段贴进公开工单
即使经过脱敏，日志仍可能包含内部 URL、接收人标识和投递元数据。提交工单时只摘录相关行，保留 `requestId`、`deliveryId`、`eventId` 等定位字段，去掉无关上下文。
:::

## 采集与保留

- 日志只写 stdout/stderr。Docker 部署由日志驱动保存，`docker compose logs` 直接读取；不要在容器内另建日志文件。
- 轮转与保留周期由部署平台决定（Docker 日志驱动、journald 或 Kubernetes 采集器），Tocsin 不管理日志文件生命周期。
- 业务数据不依赖日志：Event、Delivery 和尝试记录保存在 SQLite 中；日志用于解释过程，不用于恢复数据。业务数据的保留、容量与清理边界见[数据保留与 SQLite 容量](/operations/data-retention)。
- 备份与升级前先保全相关时间段的日志，尤其是在数据库迁移失败或需要回滚时，见[备份与恢复](/operations/backup-restore)与[版本升级与回滚](/operations/upgrade-rollback)。

## 值班检查清单

| 现象 | 先看 | 再查 |
| --- | --- | --- |
| 容器反复重启 | `docker compose ps` 与最近日志 | `tocsin.runtime` 的 SQLite 启动失败、`/api/ready` 的 `code` |
| `/api/health` 正常但 `/api/ready` 失败 | `checks` 与 `code` | 数据卷、迁移、Worker 启动错误 |
| Webhook 返回 202 但没有 Event | 响应的 `x-request-id` | `tocsin.intake` 与 `tocsin.http` 中同一 request id |
| 有 Event 但没有 Delivery | `matchedRouteCount` 与 `createdDeliveryCount` | 路由条件、目标启停、幂等去重 |
| Delivery 停在 `pending` | 设置页 Worker 状态与暂停开关 | `tocsin.worker.delivery` 批次摘要与最后错误 |
| 电话没有拨出 | 加急 Worker 状态 | `tocsin.oncall` 的入队、退避与失败行 |

相关页面：[生产监控与告警基线](/operations/monitoring) · [故障排查](/operations/troubleshooting) · [投递生命周期与重试](/operations/deliveries) · [飞书应用与电话加急](/integrations/feishu-app) · [Docker 生产部署](/operations/deploy-docker) · [TLS 反向代理](/operations/reverse-proxy) · [备份与恢复](/operations/backup-restore) · [版本升级与回滚](/operations/upgrade-rollback) · [认证与账号安全](/operations/authentication)
