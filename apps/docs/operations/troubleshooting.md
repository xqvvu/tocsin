# 故障排查

按「接收 → 解析 → 匹配 → 投递」顺序排查。先核对应用 readiness，再定位具体 Event 或 Delivery；事件页各标签的读取顺序见[事件检索与证据](/guide/events)，日志格式、级别、类别、request id 关联与安全取日志方式见[日志与可观测性](/operations/observability)。不要把入站接受误认为出站送达。

## 实例不可用

| 现象 | 检查与处理 |
| --- | --- |
| `/api/health` 成功，`/api/ready` 失败 | `/api/health` 只检查进程存活。检查 `/api/ready` 的 HTTP 状态与响应，再查看 `docker compose logs --tail=100 console`；重点看 SQLite 打开、migration、Worker 与数据卷权限错误。当前就绪检查以 HTTP `503` 和固定错误代码区分 `store_unavailable`、`migration_failed`、`migration_unknown`、`worker_unavailable`；升级期间按[版本升级与回滚](/operations/upgrade-rollback#readiness-判读)处置。 |
| 容器 unhealthy，认证密钥报错 | 确认 production 环境设置了有效 `BETTER_AUTH_SECRET`，或正确挂载并设置 `BETTER_AUTH_SECRET_FILE`。内联值非空时文件回退不会生效；修改 secret 后重启容器。 |
| dashboard 登录或回调异常 | 确认 `BETTER_AUTH_URL` 与实际外部 URL 一致；代理后使用 HTTPS，并按多 Host/Origin 场景设置允许列表。应用不自行推断代理后的外部地址；配置与验收顺序见[TLS 反向代理](/operations/reverse-proxy)。 |
| 数据库无法写入 | 核对 `/data` 对容器进程可写、卷挂载到预期位置、磁盘空间充足。不要通过删除 SQLite 文件尝试“重置”生产实例。 |
| 数据库体积持续增长或磁盘接近耗尽 | 原始载荷保留期不会删除 Event、Delivery、attempt 或加急记录；dashboard 的「可回收空间」也不是宿主机磁盘余量。按[数据保留与 SQLite 容量](/operations/data-retention#容量处置顺序)记录基线、检查 WAL/备份并评估受控的级联删除。 |

首个 owner 抢注、登录循环、session 撤销与认证密钥轮换见[认证与账号安全](/operations/authentication)。
环境变量默认值、Compose 透传差异与修改后的生效步骤见[环境变量与运行时配置](/operations/configuration)。

## Webhook 没有 Event

1. 确认请求目标是告警源自己的 `/api/sources/<source-id>/webhook` URL，而不是 dashboard 页面或通用 `/api` 路径。
2. 检查 HTTP 状态：`401` 通常是缺少或无效告警源 Token；`403` 可能表示告警源已禁用；`404` 表示告警源不存在；`413` 表示请求体超过实例上限；`400` 表示 JSON 或 Provider 解析失败。
3. Token 可放在 `Authorization: Bearer ...` 或 `X-Tocsin-Source-Token`；也可用该 Source 已配置的共享密钥，通过 `X-Tocsin-Provider-Secret` 认证。当前实现接受任一有效凭据；凭据丢失或轮换影响见[告警源接入与生命周期](/guide/sources)。
4. 检查告警源选择的 Provider 是否与上游 payload 格式一致。可在告警源配置中使用 payload 测试能力；解析错误要以当前解析器支持的字段结构为准。

入站请求会在 Event detail 中以规范化字段和脱敏调试信息展示。避免把 Token、共享密钥或未经脱敏的请求体复制进公开工单和日志。

## Event 没有预期投递

- 在 Event detail 检查 route matches 和逐项匹配条件。常见原因是 Source、severity、status、label 或文本条件与规范化后的值不一致；条件组合与多路由语义见[路由规则与匹配](/guide/routes)。
- 确认 Route 已启用，并且选择了至少一个通知目标；再检查该目标是否启用。
- 如果匹配证据显示规则命中但没有投递，查看是否是重复请求的幂等去重或目标/路由状态导致。配置删除也可能影响关联历史，执行前阅读 dashboard 的删除影响提示。
- 如果 Delivery 为 `suppressed`，查看抑制原因与时间窗。此状态代表按规则跳过发送，不代表网络失败；事件本身仍保留。静默同时会阻止自动和手动电话提醒，核对规则、提前结束静默和审计证据见[告警静默与维护时段](/operations/suppressions)。

## Delivery 失败或停滞

状态含义、退避计算、手动重试、全局暂停和积压判读的完整说明见[投递生命周期与重试](/operations/deliveries)。

1. 打开 Delivery detail，检查状态、attempt history、下次重试时间与最后错误；错误和 payload 会做脱敏，但仍应谨慎处理调试数据。
2. 先使用 Destination 的测试操作验证端点、凭证和模板，再检查目标服务是否可从 Tocsin 容器网络访问。字段与模板约束见[通知目标参考](/integrations/destinations)。
3. `pending` 或 `running` 不是最终结果。投递由进程内 Worker 异步处理；查看 Worker readiness 与运行日志，确认容器没有反复重启或 SQLite 写入错误。若 `/api/ready` 提示数据库迁移失败，先保全数据库与日志，并按升级/回滚流程处置，不要直接删改 `schema_migrations`。
4. 修复配置后，可在 Delivery detail 对可重试的失败投递执行手动 retry。若界面说明目标已接受消息但成功状态记录失败，不要盲目重发，以免通知重复。
5. 卡片已送达但没有人接到电话：查看投递详情「电话加急」表与「为什么没有自动加急」，核对目标是否开启自动加急、严重程度门槛与呼叫对象。启用条件、5 分钟去重和错误码处置见[飞书应用与电话加急](/integrations/feishu-app#常见错误)。

::: tip HTTP 202 的含义
Webhook 返回 `202 Accepted` 表示接入已接受。它不确认 Route 已命中，也不确认任何 Destination 已完成发送；最终结果以 Event 与 Delivery history 为准。
:::

相关页面：[快速开始与验证首条 Delivery](/guide/quick-start) · [认证与账号安全](/operations/authentication) · [通知目标参考](/integrations/destinations) · [告警静默与维护时段](/operations/suppressions) · [健康检查与 Docker 限制](/operations/deploy-docker) · [可移植配置与 `secret_refs`](/operations/portable-config) · [备份与恢复](/operations/backup-restore) · [版本升级与回滚](/operations/upgrade-rollback)
