---
title: Docker 生产部署
description: 单容器、单数据卷、单 SQLite 文件的 Tocsin 生产部署清单：固定镜像版本、数据卷权限、首次 setup、上线验收与升级顺序。
---

# Docker 生产部署

Tocsin 的默认部署拓扑是**一个应用容器、一个持久数据卷、一个 SQLite 数据库文件**。当前仓库状态仍是可试用的自托管 MVP，并非稳定发布版；生产部署前请先完成备份恢复演练。

进程、进程内 Worker、SQLite 与外部依赖之间的故障边界见[单实例架构与故障边界](/operations/architecture)；升级与回滚决策见[版本升级与回滚](/operations/upgrade-rollback)。

## 部署前准备

- 准备可持久化的 `BETTER_AUTH_SECRET`，可使用 `openssl rand -hex 32` 生成，至少 32 字符。缺失、过短或使用历史占位值时，进程启动即失败，所有请求（包括 `/api/ready`）都不可用，容器会被判 unhealthy；不要先用临时值启动、打算之后再换。
- 准备实例唯一的外部访问 URL。`BETTER_AUTH_URL` 是认证 base URL；`SERVER_URL` 用于对外链接，未设置时回落到认证 URL。生产必须显式覆盖这两个值，因为 Compose 会给它们填上 `http://localhost:3000`。
- 准备持久化本地卷。Compose 默认卷名为 `tocsin-data`，容器内 SQLite 默认路径是 `/data/tocsin.sqlite`。该卷含通知目标凭证等敏感配置，备份按密钥材料保护。
- 准备反向代理终止 TLS。容器只提供 HTTP；应用不替代 TLS 代理，也不会自动推断代理后的外部 URL。

## 生产 Compose 清单

仓库根的 `docker-compose.yml` 是本地试用与冒烟的基础拓扑：镜像 tag 是会被下一次构建覆盖的 `tocsin:local`，端口发布到主机所有网卡。生产请维护自己的清单，固定版本 tag，只把端口绑到 loopback。

```yaml
# compose.prod.yml —— 与部署清单一起版本管理，不要写入真实密钥
name: tocsin

services:
  console:
    build:
      context: .
    image: "tocsin:${TOCSIN_IMAGE_TAG:?set TOCSIN_IMAGE_TAG to a release tag}"
    init: true
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    env_file:
      - ./tocsin.env
    environment:
      NODE_ENV: "production"
      HOST: "0.0.0.0"
      PORT: "3000"
      TOCSIN_DATABASE_PATH: "/data/tocsin.sqlite"
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://127.0.0.1:3000/api/ready || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
    volumes:
      - tocsin-data:/data

volumes:
  tocsin-data:
    name: "tocsin-data"
```

`tocsin.env` 至少包含外部 URL 与认证密钥，权限设为 `0600`，不要提交到仓库：

```dotenv
BETTER_AUTH_SECRET=<openssl rand -hex 32 生成的值>
BETTER_AUTH_URL=https://tocsin.example.com
SERVER_URL=https://tocsin.example.com
```

在目标 release tag 的源码上构建并启动：

```bash
export TOCSIN_IMAGE_TAG=v0.1.0-beta.126   # 换成实际 release tag
docker compose -f compose.prod.yml build
docker compose -f compose.prod.yml up -d
docker compose -f compose.prod.yml ps
```

- `TOCSIN_IMAGE_TAG` 只由 Compose 做变量插值，应用不读它；变量缺失时 Compose 直接报错，避免无意中启动一个没有版本标识的镜像。
- 后续命令都显式带 `-f compose.prod.yml`，避免与本地试用实例混用同一个 Compose 项目。
- 不要用 `docker-compose.override.yml` 追加 `ports:`：Compose 会把列表与基础文件合并，两条映射会争抢宿主 3000 端口。生产清单直接写成独立文件更可控。

## 认证密钥文件注入与轮换

`BETTER_AUTH_SECRET_FILE` 用于避免认证密钥出现在 `process.env`、`docker inspect` 和 `compose config` 的解析结果中。它不是通用 secret manager：当前只有 `BETTER_AUTH_SECRET` 支持 `_FILE`，数据库内的 Source Token、目标凭证和飞书应用 secret 仍按各自导入与备份流程管理。

文件内容仍是明文，运行中的进程也会在内存中持有它。挂载文件、宿主机目录和备份都必须按密钥材料保护，不能打进镜像或提交到仓库。

### Compose 文件 secret

在 `compose.prod.yml` 中把内联值显式留空，并声明 Compose 文件 secret：

```yaml
services:
  console:
    env_file:
      - ./tocsin.env
    environment:
      BETTER_AUTH_SECRET: ""
      BETTER_AUTH_SECRET_FILE: /run/secrets/tocsin_auth_secret
    secrets:
      - tocsin_auth_secret

secrets:
  tocsin_auth_secret:
    file: "${TOCSIN_AUTH_SECRET_SOURCE:?set TOCSIN_AUTH_SECRET_SOURCE to the host secret file}"
```

`tocsin.env` 仍保存 `BETTER_AUTH_URL`、`SERVER_URL` 等非 secret 配置，但不要再包含非空的 `BETTER_AUTH_SECRET`。内联值优先于文件；如果环境里残留旧值，应用不会读取 `_FILE`。

`TOCSIN_AUTH_SECRET_SOURCE` 是 Compose 在宿主机读取 secret 文件的路径，不是容器内路径。把文件放在仓库外的受控目录，例如部署账号可写的 `/srv/tocsin/secrets/auth`；不要放进会被提交或打进镜像的目录。

密钥文件必须是单行裸值，不能写成 `BETTER_AUTH_SECRET=...`、带引号、带注释或多行 PEM。文件上限为 4 KiB；末尾换行会被去掉，内部换行、空文件和不可读文件都会让应用拒绝提供服务。生成时可以这样做：

```bash
export TOCSIN_AUTH_SECRET_SOURCE=/srv/tocsin/secrets/auth
install -d -m 0700 "$(dirname "$TOCSIN_AUTH_SECRET_SOURCE")"
(
  umask 077
  openssl rand -hex 32 > "$TOCSIN_AUTH_SECRET_SOURCE"
)
docker compose -f compose.prod.yml config --quiet
docker compose -f compose.prod.yml up -d
```

不要把 `docker compose config` 的完整输出贴到工单或聊天；它可能展开其它环境变量。验证挂载时只检查可读性和大小，不要 `cat` 密钥：

```bash
docker compose -f compose.prod.yml exec console \
  sh -c 'test -r "$BETTER_AUTH_SECRET_FILE" && wc -c < "$BETTER_AUTH_SECRET_FILE"'
curl -fsS http://127.0.0.1:3000/api/ready
```

### 不同编排方式的权限与轮换

| 注入方式 | 文件与权限 | 轮换方式 |
| --- | --- | --- |
| Compose 文件 secret | 作为 `/run/secrets/<name>` 文件挂载；本机 Compose 默认 root 所有、`0444`，容器内 `node` 用户可读 | 同一路径替换源文件后执行 `docker compose -f compose.prod.yml restart console`；挂载名或路径变化时执行 `up -d` |
| Docker Swarm secret | 仅在 `docker stack deploy` 使用 secret store；`docker compose up` 不会读取 Swarm secret，挂载为 tmpfs | secret 内容不可原地修改；创建新 secret，更新 stack 引用并使用新名称，验证后再移除旧 secret |
| Kubernetes Secret 卷 | 仓库不提供官方 Deployment 或 Helm chart；使用平台现有方式把密钥投影为文件，并确保容器 uid/gid `1000` 可读 | 更新 Secret 后重启 Pod，确保进程在启动时重新读取；不要同时注入非空的内联值 |
| 宿主机 bind mount | 文件必须对容器 uid/gid `1000` 可读；entrypoint 只修复 `/data` 数据目录，不会修改 secret 文件权限 | 替换同一路径的文件后重启容器；如果只改挂载声明，则重建容器 |

Kubernetes 若把 Secret 文件模式设为 `0400`，必须确保卷和文件对 uid/gid `1000` 可读，通常需要配置 `fsGroup: 1000`；运行进程使用不同 group 时再显式设置 `runAsGroup: 1000`。Kubernetes 更新投影文件可能有延迟；需要确定何时生效时，以重启 Pod 为边界，而不是假设运行中的进程会重新读取。

### 轮换步骤

轮换认证密钥会让所有 dashboard session 失效，但不会修改账号密码、告警源 Token、通知目标凭证或业务数据。

1. 记录当前镜像、Compose/编排配置和回滚方式。按[备份与恢复](/operations/backup-restore)完成可用备份。
2. 生成新的高熵值，写入新的 secret 文件或新的编排 secret 对象。不要在终端参数、镜像层或仓库文件中写入明文。
3. 保持 `BETTER_AUTH_SECRET` 为空，把 `BETTER_AUTH_SECRET_FILE` 指向新文件；需要换挂载名时同步修改编排引用。
4. 重启或重建容器，等待 `/api/ready` 返回 `200`，再登录并走一次测试投递。
5. 确认旧 session 已失效、日志没有输出密钥内容后，再按变更流程销毁旧 secret。若怀疑旧值已经泄露，不要为了回滚继续保留它。

### 文件注入失败怎么判

| 现象 | 常见原因 | 处理 |
| --- | --- | --- |
| 所有请求含 `/api/ready` 返回 `500`，日志报 `Unable to read BETTER_AUTH_SECRET_FILE` | 路径写错、文件未挂载、uid/gid `1000` 不可读 | 核对容器内路径、挂载和文件权限；不要先删数据库 |
| 日志报 `must contain a single line` | 文件是 `.env` 格式、包含注释或 PEM | 改为单行裸值，只保留末尾换行 |
| 日志报文件过大或为空 | secret 文件误写成证书、批量环境文件或空文件 | 重新生成 4 KiB 以内的单行值 |
| 文件明明已更新，页面仍接受旧 session | 进程没有重启，或内联 `BETTER_AUTH_SECRET` 仍非空 | 重启或重建容器，并确认内联值已清空 |
| Kubernetes Pod 权限拒绝 | Secret 文件模式过严，uid/gid `1000` 不可读 | 配置 `fsGroup` / `runAsGroup`，或调整文件模式 |
| `docker compose config` 或日志中出现 secret | 使用了内联变量、打印了文件内容，或没有加 `--quiet` | 停止传播输出，按泄露流程轮换密钥 |

只有认证密钥支持 `_FILE`；配置导入时 `TOCSIN_SOURCE_*`、`TOCSIN_DEST_*` 与 `TOCSIN_FEISHU_APP_*` 引用仍只读取进程环境，见[可移植配置参考](/operations/portable-config)。

## 数据卷与文件权限

- 唯一持久状态在 `/data`：`tocsin.sqlite` 以及 WAL 模式下的 `tocsin.sqlite-wal`、`tocsin.sqlite-shm`。
- 镜像默认以 root 启动 entrypoint：创建数据目录，把目录与数据库三个文件 chown 给 `node:node`（uid/gid `1000`），再用 `gosu node` 降权运行应用。卷从旧主机迁移或恢复后，下一次正常启动会自动修正属主。
- 如果你用 `user: "1000:1000"` 之类方式让容器直接以非 root 启动，entrypoint 不会执行 chown。此时必须预先让卷内目录与文件属于 `1000:1000`，否则 SQLite 无法写入，`/api/ready` 返回 `503`、`code` 为 `store_unavailable`。
- 核对属主：

```bash
docker compose -f compose.prod.yml exec console id
docker compose -f compose.prod.yml exec console ls -ln /data
```

`id` 应显示 uid/gid `1000`；`ls -ln` 中数据目录与数据库文件也应是 `1000 1000`。

- 使用命名卷或显式 bind mount。不要在未挂载 `/data` 的情况下运行：镜像声明的 `VOLUME` 会生成难以追踪的匿名卷，重建容器后容易丢数据。
- `docker compose down -v` 会删除命名卷，等同删除实例全部数据。停容器用不带 `-v` 的 `down` 或 `stop`。
- 不要把 SQLite 放在 NFS 等网络文件系统上，也不要让多个容器共享同一卷。

## 启动与首次 setup

启动后先确认就绪，再访问 dashboard：

```bash
curl -fsS http://127.0.0.1:3000/api/ready
```

返回 `200` 且 `checks.sqlite`、`checks.migrations`、`checks.worker` 均为 `ok` 才算就绪；`/api/health` 只表示进程存活。就绪失败时按固定的 `code` 判读，见[版本升级与回滚](/operations/upgrade-rollback#readiness-判读)。

在开放外部访问前立即完成 `/setup`。第一个注册用户成为 owner，之后的注册会被拒绝（`Owner user already exists`）；实例不提供「让公网访问者先注册、稍后再关」的安全缓冲。首次 setup 完成后再通过 TLS 代理开放 dashboard 与 webhook；完成后再次访问 `/setup` 会跳转到登录页。

首个 owner 的创建条件、登录会话管理与密码边界见[认证与账号安全](/operations/authentication)。

## 首次上线验收清单

部署完成不等于可以接生产告警。按顺序走完一条完整链路，并保留每一步的输出：

1. 通过外部地址访问 `/api/ready`，而不是只测 loopback。这一步同时验证 TLS、代理转发和请求路径：`curl -fsS https://tocsin.example.com/api/ready`。
2. 用外部地址完成登录、退出，再登录一次，确认 session 与 cookie 在代理后正常。
3. 新建一个测试通知目标并执行目标测试，确认凭证与出站网络可用。各类型的成功判定见[通知目标验收与失败判读](/integrations/destination-verification)。
4. 新建一个 `Generic Webhook` 告警源，保存一次性显示的 Webhook URL 与接入 Token；关闭提示后 Token 不再显示。
5. 新建一条匹配 `critical` 的路由，选择该告警源和测试通知目标。
6. 发送一条测试告警，确认返回 `202`：

```bash
curl -i -X POST 'https://tocsin.example.com/api/sources/<source-id>/webhook' \
  -H "Authorization: Bearer $TOCSIN_SOURCE_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"id":"deploy-check-001","title":"Deploy check","severity":"critical","status":"firing"}'
```

响应体应为 `accepted: true`，且 `deliveriesCreated` 至少为 `1`。`202` 只表示已接收，不代表已经送达；`deliveriesCreated` 为 `0` 通常说明路由未命中、路由或目标已停用，或同一幂等键仍在去重窗口内。

7. 在「事件」页确认 Event 已入库、规范化字段正确，并显示路由匹配证据；在「投递」页确认对应 Delivery 最终为 `succeeded`。失败时先读尝试记录，不要直接重发。判读方法见[投递检索、生命周期与重试](/operations/deliveries)与[故障排查](/operations/troubleshooting)。
8. 重启容器，确认数据实际落在持久卷上：

```bash
docker compose -f compose.prod.yml restart console
curl -fsS http://127.0.0.1:3000/api/ready
```

重启后告警源、路由、通知目标与刚才的 Event/Delivery 应仍然存在，`/api/ready` 重新为 `200`。如果数据消失，说明 `/data` 没有挂到预期卷，先停止接流量。

9. 查看启动日志，确认没有 migration 失败或 Worker 启动错误：

```bash
docker compose -f compose.prod.yml logs --tail=100 console
```

日志为 JSON Lines（`TOCSIN_LOG_FORMAT=auto` 在 production 下），字段与脱敏边界见[日志与可观测性](/operations/observability)。

以上步骤与[快速开始](/guide/quick-start)的链路一致，区别是这里通过代理后的外部地址验收，并使用固定版本的生产镜像。

## 升级与回滚

升级顺序固定为：完成冷备份 → checkout 新 release tag 并更新 `TOCSIN_IMAGE_TAG` → `docker compose -f compose.prod.yml up -d` → 等 `/api/ready` → 重跑上面的验收链路。`docker compose restart` 不会应用新镜像或新的环境变量；`up -d --build` 会覆盖版本镜像，不要作为升级方式。

数据库 migration 只向前推进，旧镜像可能无法识别新台账。升级失败时先读 readiness 的 `code`，再决定回退镜像还是恢复备份，完整判定见[版本升级与回滚](/operations/upgrade-rollback)与[备份与恢复](/operations/backup-restore)。

## 反向代理与限制

- 代理终止 TLS，并将 HTTP 请求转发到容器端口。应用没有内置 TLS 终止。
- nginx/Caddy 的完整配置、Host/客户端 IP 边界、请求体校验与上线检查见 [TLS 反向代理](/operations/reverse-proxy)。
- 明确设置 `BETTER_AUTH_URL` 与 `SERVER_URL` 为外部访问地址。通过其他 Host 或 Origin 访问时，按需配置 `BETTER_AUTH_ALLOWED_HOSTS` 与 `BETTER_AUTH_TRUSTED_ORIGINS`；当前 Compose 未透传这两个变量，可用自有 override 补充。
- 代理的请求体上限不可低于 `TOCSIN_MAX_WEBHOOK_BYTES`（默认 1 MiB，最大 10 MiB），否则 payload 可能在到达应用前被拒绝。
- 单机本地卷是默认数据面；不支持多实例写入同一 SQLite 文件，不建议使用 NFS 等网络文件系统承载数据库。
- Docker healthcheck 使用 `/api/ready`。容器变为 unhealthy 不会触发 `restart: unless-stopped` 重启，需要外部监控告警并由人处理。

## 运行时配置

生产启动至少要明确认证 secret、外部 URL 和数据库位置：

| 变量 | 用途 | 生产约束 |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` / `_FILE` | Dashboard session 签名密钥 | 必须提供至少 32 字符的实例专属值；内联值优先于文件。 |
| `BETTER_AUTH_URL` | Better Auth 对外 base URL | 设为代理后的最终 HTTPS 地址。 |
| `SERVER_URL` | 公开实例 URL 与事件直链 | 通常与 `BETTER_AUTH_URL` 相同。 |
| `TOCSIN_DATABASE_PATH` | SQLite 文件位置 | Compose 容器内为 `/data/tocsin.sqlite`。 |

超时、Webhook 上限、Worker、日志、Host/Origin、Compose 透传差异与 override 示例统一见[环境变量与运行时配置](/operations/configuration)。`BETTER_AUTH_SECRET_FILE` 仅支持认证密钥，不意味着所有配置 secret 都支持 `_FILE`。不要将真实密钥写入公开配置文件或文档。

通过设置页导入 TOML/JSON 时，`secret_refs` 指向的变量也必须在 Tocsin 进程环境中存在；它们不会从浏览器读取，也不支持 `_FILE`。字段与合并语义见[可移植配置参考](/operations/portable-config)。

::: danger 不支持横向扩容
一个实例对应一个 SQLite 数据库和进程内 Worker。不要运行多个副本争用同一数据卷，也不要把这个部署形态当作高可用集群。
:::

下一步：[单实例架构与故障边界](/operations/architecture) · [环境变量与运行时配置](/operations/configuration) · [认证与账号安全](/operations/authentication) · [备份与恢复](/operations/backup-restore) · [版本升级与回滚](/operations/upgrade-rollback) · [生产监控与告警基线](/operations/monitoring) · [健康检查和告警链路排障](/operations/troubleshooting)
