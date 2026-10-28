---
title: 单实例架构与故障边界
description: 从 SRE 视角理解 Tocsin 的单进程、SQLite、进程内 Worker、启动迁移、故障隔离、备份与升级影响。
---

# 单实例架构与故障边界

Tocsin 的默认运行模型是**一个应用进程、一个本地 SQLite 数据库和进程内后台 Worker**。没有独立队列、Redis、PostgreSQL 或单独部署的 Worker；理解这个边界，才能正确判断一次故障影响的是接入、排队、发送还是外部链路。

本页解释运行时形状和运维取舍。[处理链路与概念](/guide/concepts)说明 Source、Event、Route、Destination 与 Delivery 的业务含义；具体部署命令见[Docker 生产部署](/operations/deploy-docker)。

## 部署形状

```text
上游监控系统
      |
      | HTTPS webhook
      v
反向代理 / TLS
      |
      | HTTP
      v
+--------------------------------------------------+
| Tocsin console process                           |
|                                                  |
|  Dashboard / oRPC / API / Webhook intake         |
|  Route matching / configuration / history        |
|  Delivery worker + on-call worker                |
+---------------------------+----------------------+
                            |
                            | local file I/O
                            v
                 /data/tocsin.sqlite (+ WAL/SHM)
                            |
                            | outbound HTTPS
                            v
             Feishu / Slack / Webhook / email gateway
```

| 部件 | 是否独立部署 | 运维含义 |
| --- | --- | --- |
| Console 进程 | 否，一个实例一个进程 | 同时承载页面、API、Webhook 接入、业务逻辑和后台 Worker。进程退出会同时停止接收与队列推进。 |
| SQLite | 否，本地文件 | 保存配置、凭证、队列、用户、session、Event、Delivery 和 migration 台账。它是唯一业务持久状态。 |
| 投递 Worker | 否，进程内 timer | 轮询 SQLite 中的 Delivery 队列，领取到期任务并调用外部目标。 |
| 加急 Worker | 否，进程内 timer | 轮询独立的电话加急队列；与投递队列共用轮询间隔和批次上限。 |
| 反向代理 | 是，部署方负责 | 终止 TLS、限制请求体并暴露规范域名；应用本身只提供 HTTP。 |
| 日志采集 | 是，部署方负责 | 应用向 stdout/stderr 输出日志；运行日志不写入 SQLite，也不默认落本地文件。 |

## 一次告警穿过系统

1. 反向代理把请求送到 Webhook 路由。Tocsin 先校验 Source Token 或该 Source 的额外共享密钥，再解析 Provider 载荷。
2. 已启用 Route 在接入时完成匹配。Event、路由匹配快照和对应的 Delivery 队列记录在同一个 SQLite 事务中提交。
3. 事务提交后，Webhook 返回 HTTP `202`。该响应只证明 Event 与投递任务已经持久化，不证明外部目标已经接收消息。
4. 投递 Worker 按轮询间隔领取到期任务并调用 Destination。发送结果、尝试记录、错误和下次重试时间写回 SQLite。
5. 电话加急进入单独队列，由加急 Worker 派发。主投递成功不等同于电话已经接通。

因此排查时沿同一条链路读取证据：Event 证明收到什么，Route evidence 证明为何匹配，Delivery 证明向哪里发送以及结果如何。状态、退避与“至少一次”投递语义见[投递检索、生命周期与重试](/operations/deliveries)。

## 认证边界

Dashboard 与 Webhook 使用两条独立认证路径：

| 入口 | 凭据 | 适用范围 |
| --- | --- | --- |
| Dashboard、oRPC、配置与历史数据 | Better Auth session | 仅 owner/admin 可访问。浏览器 session 不能替代告警源凭据。 |
| `/api/sources/:sourceId/webhook` | Source Token 或 Source 额外共享密钥 | 面向上游监控系统；不读取 dashboard session。 |

外部探针只应访问健康检查页面，不应持有 dashboard 或 Source 凭据。账号恢复、session 撤销与密钥轮换见[认证与账号安全](/operations/authentication)。

## 持久化与重启语义

| 状态 | 重启后 | 说明 |
| --- | --- | --- |
| Source、Route、Destination、设置、静默、Integration | 保留 | 均在 SQLite 中。 |
| 用户、session、Better Auth 数据 | 保留 | session 存在数据库中，但轮换认证 secret 会使其失效。 |
| Event、Delivery、attempt、加急记录 | 保留 | 历史不会因进程重启而重建或补发。 |
| 待执行与退避中的队列项 | 保留 | Worker 重启后继续轮询；全局投递暂停状态也保存在设置中。 |
| 处于 `running` 的发送 | 结果未知 | 超过 stale 窗口后回收。目标可能已经收到原请求，重试可能造成重复通知。 |
| Worker 最近状态与最近一批计数 | 清空 | 这些是进程内快照，不是持久 metrics。 |
| 容器日志 | 由外部系统决定 | 采集、轮转和保留必须在部署侧配置。 |

停机期间上游 Webhook 会失败，已经提交到 SQLite 的 Delivery 则保留在队列中。恢复进程后先确认 `/api/ready`、Worker 状态和积压规模，再判断是否需要外部补告警。

## 故障边界

| 故障 | 直接影响 | 数据与恢复判断 |
| --- | --- | --- |
| Console 进程退出、OOM 或被重启 | Dashboard、Webhook 和两个 Worker 同时停止 | 已提交数据保留；进程恢复后继续队列。在途发送可能重复，先按 Delivery 详情核实。 |
| SQLite 文件损坏、丢失或卷未挂载 | 配置、用户、队列与历史均不可用 | 应用无法就绪；不要删库重建。按备份恢复流程处理。 |
| 数据卷写满 | Webhook 事务、投递结果和 migration 都可能失败 | 接入不再可靠；清理日志、备份或扩容后仍需核对漏告警。 |
| 外部通知目标超时或拒绝 | Event 已接收，Delivery 失败、重试或进入终态失败 | 查看尝试记录和目标状态；修复后按投递规则重试。 |
| DNS、TLS 或反向代理故障 | 外部无法访问 dashboard 与 Webhook，内部进程可能仍健康 | 同时检查代理、证书、DNS 和应用 readiness；容器内部探针不能覆盖该路径。 |
| Worker 内部错误 | API 可能仍可访问，但队列不再可靠推进 | 观察 `tocsin.worker.*`、设置页 Worker 状态和积压；readiness 启动成功后不会持续证明每轮发送成功。 |
| 日志采集中断 | 业务数据不一定受影响，但告警与审计信号缺失 | 用独立的外部 probe、canary 和存储监控补足，不能把“没有日志”当作健康。 |

SQLite 使用 WAL、外键约束和 5 秒 busy timeout。它能承受单进程内页面、接入与 Worker 的并发访问，但不是多副本数据库，也不能消除写锁竞争。不要把数据库放在 NFS 等不适合 SQLite 的网络文件系统上。

## 健康检查能回答什么

| 端点 | 检查范围 | 不能替代 |
| --- | --- | --- |
| `/api/health` | 进程能响应 | SQLite、migration、Worker、外部目标均未验证。 |
| `/api/ready` | SQLite 可打开、migration 台账可读、Worker 可启动；失败时返回固定 `code` | TLS、DNS、反向代理、目标可达性、Route 命中、队列持续推进和真实送达。 |

生产环境应使用独立故障域的外部探针访问规范域名，并增加 `Webhook -> Event -> Route -> Delivery -> 接收端` canary。阈值与日志规则见[生产监控与告警基线](/operations/monitoring)，错误码判读见[日志与可观测性](/operations/observability#健康检查、worker-状态与投递健康)。

## 明确的运行约束

- **一个 SQLite 文件只对应一个 Tocsin 实例。** 不要启动多个副本共享同一数据卷，也不要尝试用副本数做高可用。
- **数据卷必须是本机、低延迟且持久。** 容器替换不能丢失 `/data`；同一快照中的主库、`-wal` 与 `-shm` 必须一起备份。
- **数据库等同密钥材料。** 其中包含通知目标凭证、Source 共享密钥、用户和 session。备份、快照和恢复副本都需要加密与受控访问。
- **扩容优先纵向进行。** 提高 CPU、内存和本地磁盘性能，比增加应用副本身份更符合当前架构。
- **Delivery 是至少一次语义。** 超时、进程中断或回收都可能让目标已经收到消息但 Tocsin 未确认结果。
- **历史增长需要主动治理。** 原始载荷清理不会删除 Event、Delivery、attempt 或加急记录，也不会自动缩小数据库文件。

## 升级与恢复影响

应用在启动阶段打开 SQLite 并执行尚未记录的 forward-only migration。迁移未通过时，实例不会进入正常可服务状态；旧镜像如果遇到不认识的 migration 台账，也会拒绝就绪。

升级前必须冷备份并阅读目标版本说明。不要通过删除 migration 台账或数据库文件“重试”，除非目标版本文档给出了明确的已验证回退路径。完整流程见[版本升级、回滚与数据库兼容性](/operations/upgrade-rollback)，备份与恢复命令见[备份与恢复](/operations/backup-restore)。

容量规划要同时考虑原始载荷保留期、路由扇出、失败重试、投递历史、备份和 WAL。规划方法与数据库空间指标见[数据保留与 SQLite 容量](/operations/data-retention)。

相关页面：[处理链路与概念](/guide/concepts) · [Docker 生产部署](/operations/deploy-docker) · [TLS 反向代理](/operations/reverse-proxy) · [环境变量与运行时配置](/operations/configuration) · [投递检索、生命周期与重试](/operations/deliveries) · [生产监控与告警基线](/operations/monitoring) · [故障排查](/operations/troubleshooting)
