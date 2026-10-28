---
title: 环境变量与运行时配置
description: Tocsin 的认证、外部 URL、SQLite、Webhook、Worker、日志与 Compose 运行时配置参考。
---

# 环境变量与运行时配置

Tocsin 的部署行为由进程环境决定。本页是公开站点的运行时变量参考，说明默认值、范围和生效方式；Docker 拓扑与首次上线步骤见[Docker 生产部署](/operations/deploy-docker)，账号安全操作见[认证与账号安全](/operations/authentication)。

::: warning 不要把真实值写进部署文件
本页只使用示例域名和占位值。认证密钥、Source Token、通知目标密码与签名密钥不能写入仓库、镜像、工单或公开日志。
:::

## 读取与生效规则

- `apps/console/src/env.ts` 定义应用环境变量的 schema。应用同时读取进程环境与 Vite 环境；空字符串按“未设置”处理，因此删除变量或设为空会触发对应默认值。
- 环境变量在进程启动时形成运行时配置。应用没有热重载端点；修改后必须重启或重建容器。
- 修改 Compose/override 的 `environment` 后，用 `docker compose up -d` 重建容器才能应用新值。只替换同路径 secret 文件内容时，`docker compose restart console` 会重新启动并读取文件。
- 设置页的「运行时与生效参数」显示已生效的超时、Webhook 上限、Worker 参数与日志配置。它不显示认证 URL、密钥或环境变量来源，也不能替代部署清单。
- 语言、时区、[原始载荷保留天数](/operations/data-retention)和全局投递暂停属于数据库中的运行设置，不是环境变量。可移植配置里的 `secret_refs` 只用于导入时解析密钥值，也不等同于部署变量。

## 认证与外部 URL

| 变量 | 默认值 | 作用与约束 |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | 无 | Dashboard session 签名密钥。提供时至少 32 个字符；production 必须提供有效值，仓库历史公开值会被拒绝。轮换后所有 dashboard session 失效。 |
| `BETTER_AUTH_SECRET_FILE` | 无 | 仅当 `BETTER_AUTH_SECRET` 为空时读取。文件必须是单行裸值、不超过 4 KiB，并对容器内 uid/gid `1000` 可读；缺失、空文件、多行或超限都会使应用拒绝提供服务。读到的值不会写回 `process.env`。 |
| `BETTER_AUTH_URL` | 无 | Better Auth 对外 base URL。必须与实际访问协议和域名一致；设置 `BETTER_AUTH_ALLOWED_HOSTS` 时作为动态 Host 校验的回落地址。 |
| `SERVER_URL` | 无 | 公开实例 URL，用于通知模板中的事件直链。未设置时回落到 `BETTER_AUTH_URL`；`BETTER_AUTH_URL` 也未设置时，作为 Better Auth base URL 的回落值。 |
| `BETTER_AUTH_ALLOWED_HOSTS` | 无 | 可选 Host 白名单，值可用逗号或换行分隔并自动去重。Host 示例：`tocsin.example.com,ops.internal:3000`。 |
| `BETTER_AUTH_TRUSTED_ORIGINS` | 无 | 可选额外可信 Origin，值可用逗号或换行分隔并自动去重。Origin 示例：`https://tocsin.example.com,https://ops.internal:3000`。 |

生产部署通常把 `BETTER_AUTH_URL` 与 `SERVER_URL` 设为同一个最终外部 HTTPS URL。当前 Compose 已给两者 `http://localhost:3000` 默认值；如果只覆盖 `SERVER_URL` 而保留认证 URL 默认值，事件直链会指向公网地址，认证却仍按 localhost 生成 URL。反向代理、多个域名和临时 Host 的配置步骤见[TLS 反向代理](/operations/reverse-proxy)。

`BETTER_AUTH_SECRET_FILE` 是当前唯一支持 `_FILE` 间接读取的应用变量。`TOCSIN_SOURCE_*`、`TOCSIN_DEST_*`、`TOCSIN_FEISHU_APP_*` 等可移植配置引用只读取 `process.env`。

## SQLite、Webhook 与 Worker

| 变量 | 默认值 | 作用与约束 |
| --- | --- | --- |
| `TOCSIN_DATABASE_PATH` | 应用为 `<cwd>/data.sqlite`；镜像为 `/data/tocsin.sqlite` | SQLite 主数据库路径。应位于本机持久卷，不能让多个实例并发共享同一文件。 |
| `TOCSIN_DESTINATION_TIMEOUT_MS` | `10000` | 通知目标、实际投递、加急请求与飞书应用连通性检查共用的出站 HTTP 超时，单位毫秒，范围 `1`–`30000`。 |
| `TOCSIN_MAX_WEBHOOK_BYTES` | `1048576`（1 MiB） | 单个入站 Webhook 请求体上限，单位字节，范围 `1`–`10485760`（10 MiB）。反向代理的上限不能低于该值。 |
| `TOCSIN_WORKER_BATCH_SIZE` | `10` | 每个 Worker 每轮最多领取的队列项，同时作用于投递与加急队列，范围 `1`–`100`。 |
| `TOCSIN_WORKER_INTERVAL_MS` | `5000` | 投递与加急 Worker 的轮询间隔，单位毫秒，范围 `1`–`60000`。 |
| `TOCSIN_WORKER_STALE_RUNNING_MS` | `300000`（5 分钟） | 超过该时长仍为 `running` 的队列项可被回收，范围 `1`–`3600000`。投递与加急队列共用。 |

`TOCSIN_DESTINATION_TIMEOUT_MS` 是全局值，不能按 Destination 单独设置。为了一个慢目标放宽它，也会放宽所有目标的测试与发送 deadline。

Worker 参数同时影响两类进程内队列。把 `TOCSIN_WORKER_INTERVAL_MS` 设为很小、把批量设为很大，会增加 SQLite 与出站请求压力；把 `TOCSIN_WORKER_STALE_RUNNING_MS` 设得短于正常批次耗时，则可能在任务仍发送时被回收。调整后应观察设置页 Worker 状态、`tocsin.worker.delivery`、`tocsin.worker.oncall` 日志以及重复通知风险。状态与退避语义见[投递生命周期与重试](/operations/deliveries)。

## 日志

| 变量 | 默认值 | 可选值 |
| --- | --- | --- |
| `TOCSIN_LOG_LEVEL` | `info` | `trace`、`debug`、`info`、`warning`、`error`、`fatal`、`off` |
| `TOCSIN_LOG_FORMAT` | `auto` | `auto`、`json`、`text` |

`auto` 在 production build 输出 JSON Lines，在开发模式输出文本。`off` 关闭 `tocsin.*` 业务日志，但底层日志库自身的警告仍可能输出。日志字段、request id、类别与脱敏边界见[日志与可观测性](/operations/observability)。

`VITE_APP_TITLE` 虽在环境 schema 中声明，但当前没有运行时读取点，不是运维开关。

## Compose 与 entrypoint 变量

以下变量不由 `apps/console/src/env.ts` 校验：

| 变量 | 默认值 | 层级与行为 |
| --- | --- | --- |
| `NODE_ENV` | 镜像内为 `production` | 切换认证的生产保护与日志 `auto` 模式。生产部署不要改成 development 来绕过密钥检查。 |
| `HOST` | 镜像内为 `0.0.0.0` | Node server 监听地址。容器内通常无需修改。 |
| `PORT` | 镜像内为 `3000` | Node server 容器监听端口。修改后需同步调整 Compose 端口映射与健康检查。 |
| `TOCSIN_HTTP_PORT` | `3000` | 只改变 Compose 发布到宿主机的端口，不改变容器内 `3000`。 |
| `TOCSIN_DATA_DIR` | 数据库目录；未设置时为 `/data` | Entrypoint 以 root 启动时创建并 `chown` 该目录。只管理数据卷目录，不管理 secret 文件权限。 |

当前仓库的 `docker-compose.yml` 未透传 `BETTER_AUTH_ALLOWED_HOSTS`、`BETTER_AUTH_TRUSTED_ORIGINS`、`TOCSIN_DESTINATION_TIMEOUT_MS`、`TOCSIN_DATA_DIR` 等可选变量。可以在自己的 Compose override 或其它编排清单中显式补充；Compose 会自动合并 `docker-compose.override.yml`。

## Compose override 示例

下面的 override 只展示非 secret 的常见生产调整。真实域名必须替换。

```yaml
services:
  console:
    environment:
      BETTER_AUTH_ALLOWED_HOSTS: "tocsin.example.com"
      BETTER_AUTH_TRUSTED_ORIGINS: "https://tocsin.example.com"
      TOCSIN_DESTINATION_TIMEOUT_MS: "15000"
      TOCSIN_MAX_WEBHOOK_BYTES: "2097152"
      TOCSIN_WORKER_BATCH_SIZE: "20"
      TOCSIN_LOG_LEVEL: "info"
```

认证 secret 的内联值或挂载文件配置见[认证与账号安全](/operations/authentication#部署前必须确定的事)。不要把 secret 写进这个 override 文件。

## 可移植配置中的环境变量引用

从 TOML/JSON 导入配置时，`secret_refs` 的值是当前 Tocsin 进程中的环境变量名。默认导出名遵循以下格式：

| 资源 | 默认格式 |
| --- | --- |
| 告警源 | `TOCSIN_SOURCE_<SOURCE_ID>_<FIELD>` |
| 通知目标 | `TOCSIN_DEST_<DESTINATION_ID>_<FIELD>` |
| 飞书应用 | `TOCSIN_FEISHU_APP_<APP_RECORD_ID>_APPSECRET` |

这些变量必须存在于执行导入的实例中。它们不会由浏览器上传，不支持 `_FILE`，也不会因 `BETTER_AUTH_SECRET_FILE` 启用而获得文件解析能力。字段路径、默认命名和导入事务语义见[可移植配置参考](/operations/portable-config)。

## 修改与核对

1. 在部署平台的 secret store、挂载文件或受保护的运行时配置中写入新值，不要通过命令行参数把 secret 暴露到进程列表或 shell history。
2. 修改 Compose 或 override 后，先用 `docker compose config --quiet` 做语法校验。不要对不加 `--quiet` 的输出做截图或粘贴，它可能包含解析后的 secret。
3. 环境映射发生变化时执行 `docker compose up -d`；只有同路径 secret 文件内容变化时执行 `docker compose restart console`。
4. 运行 `docker compose ps` 和 `curl -fsS http://localhost:3000/api/ready`，确认容器健康。
5. 登录后在「设置 → 运行时与生效参数」核对超时、Webhook 上限、Worker 参数和日志值。
6. 用一次 Webhook → Event → Route → Delivery 验证实际链路，而不只看进程状态。

## 常见配置故障

| 现象 | 常见原因 | 处理 |
| --- | --- | --- |
| 所有请求含 `/api/ready` 返回 `500` | 认证 secret 缺失、过短、仍是公开占位值，或 `_FILE` 不可读 | 修正 secret 来源并重建/重启容器，检查启动日志；不要删除数据库。 |
| 登录后立即回到登录页，或回调地址错误 | `BETTER_AUTH_URL` 与代理后的实际 URL 不一致 | 把认证 URL 设为最终 HTTPS 地址，并核对 Host、Origin 与 Cookie。 |
| Compose 中设置了变量但设置页仍显示默认值 | 只执行了 `restart`，环境映射没有重建；变量名拼错；基础 Compose 未透传 | 用 `docker compose up -d` 应用配置，并在 override 中显式声明变量。 |
| Webhook 返回 `413` | 请求体超过 `TOCSIN_MAX_WEBHOOK_BYTES`，或代理上限更低 | 先检查代理限制，再评估是否需要提高全局上限。 |
| 多个慢目标同时超时 | 全局 `TOCSIN_DESTINATION_TIMEOUT_MS` 不足以覆盖目标响应时间 | 检查目标网络与响应耗时；提高该值会同时影响所有出站 HTTP。 |
| Delivery 迟迟不推进 | Worker 未启动、队列已暂停、轮询间隔过大或批次长期失败 | 查看 readiness、设置页 Worker 状态和 `tocsin.worker.*` 日志。 |
| 导入可移植配置时报缺少环境变量 | `secret_refs` 指向的变量不在导入进程环境中，或误以为支持 `_FILE` | 把变量注入当前实例后重试，或修改引用名。 |
| 日志量突然增大 | 临时把 `TOCSIN_LOG_LEVEL` 设为 `debug` 或 `trace` 后未恢复 | 恢复为 `info` 并重启；成功探针日志在 `info` 下正常不可见。 |

相关页面：[Docker 生产部署](/operations/deploy-docker) · [认证与账号安全](/operations/authentication) · [日志与可观测性](/operations/observability) · [投递生命周期与重试](/operations/deliveries) · [可移植配置参考](/operations/portable-config) · [故障排查](/operations/troubleshooting)
