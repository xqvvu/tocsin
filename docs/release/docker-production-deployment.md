# Docker 生产部署（自托管）

> 一句话结论：Tocsin 的受支持形态是**一个容器 + 一个数据卷 + 一个 SQLite 文件**；容器只提供明文 HTTP
> 3000，TLS、反向代理和 secret 的分发都要由运维自己解决。`docker-compose.yml` 不再内置任何可用的
> `BETTER_AUTH_SECRET`，部署前必须提供内联值或 `BETTER_AUTH_SECRET_FILE`。

本文所有端口、路径、变量都核对过当前仓库：`Dockerfile`、`docker-compose.yml`、`scripts/docker-entrypoint.sh`、
`apps/console/src/env.ts`、`apps/console/src/lib/auth-config.ts`、`apps/console/src/routes/api/{health,ready}.ts`。
备份、升级、回滚见 `docs/release/backup-restore-upgrade.md`；发布流程见
`docs/release/release-checklist.md`。

## 1. 先说清楚缺口（这些今天**没有**现成方案）

| 运维预期                     | 现状                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------- |
| TLS 终止                     | **没有。** 应用只监听明文 HTTP；生产必须在反向代理终止 TLS                        |
| Secret 注入                   | **`BETTER_AUTH_SECRET` 支持 `_FILE`**（Compose file secret / Swarm secret / K8s Secret 卷）；其余 secret 仍只走环境变量 |
| 默认 secret 安全              | **已修复。** compose 不再内置任何默认值：未设置时为「空」，应用在 production 模式启动即拒绝；历史公开值仍在黑名单 |
| 端口暴露范围                  | compose 默认把 3000 发布在所有网卡（`"${TOCSIN_HTTP_PORT:-3000}:3000"`），不会自动只绑 127.0.0.1 |
| 多副本 / 横向扩容             | **不支持。** 单进程 + 进程内 worker + 单文件 SQLite 是设计约束                    |
| unhealthy 自动重启            | **没有。** compose 只有 `restart: unless-stopped`；容器变 unhealthy 不会自动重建  |
| 日志轮转                      | 没有应用侧配置；日志写 stdout，轮转由 Docker daemon 负责                          |
| 反向代理头（`X-Forwarded-*`） | 仓库里没有自定义转发头处理；对外 URL 完全由 `BETTER_AUTH_URL` / `SERVER_URL` 决定 |

## 2. 镜像与容器事实

- **构建**：多阶段构建。build 阶段用 `ghcr.io/voidzero-dev/vite-plus:1.1.0`，按 `.node-version`
  （当前 `26.12.1`）装 Node 与依赖，产物是 `apps/console/.output`；runtime 阶段是
  `debian:trixie-slim` + 从 build 阶段拷来的 node 二进制，只安装 `gosu`、`curl`、`libatomic1`、
  `ca-certificates`。
- **启动命令**：`node .output/server/index.mjs`（Nitro node-server preset）。容器内监听
  `HOST` / `PORT`，镜像默认 `0.0.0.0:3000`。
- **端口**：只 `EXPOSE 3000`；compose 用 `${TOCSIN_HTTP_PORT:-3000}` 映射到宿主机。
- **运行用户**：entrypoint 以 root 启动 → 确保 `/data`（或 `TOCSIN_DATA_DIR`）存在并 chown 给
  `node:node`（uid/gid 1000），并修正数据库文件与 `-wal` / `-shm` 的属主 → 用 `gosu node` 降权执行。
  如果运维自己指定 `user:`，这段 chown 不会执行。
- **数据卷**：`VOLUME ["/data"]`；compose 声明命名卷 `tocsin-data`（`name: tocsin-data`）；
  数据库默认 `/data/tocsin.sqlite`。
- **健康检查**：镜像 `HEALTHCHECK` 与 compose `healthcheck` 都调用
  `curl -fsS http://127.0.0.1:3000/api/ready`，间隔 30s、超时 5s、重试 3 次、启动宽限 20s。
- **启动顺序**：server entry 用顶层 `await` 先打开 SQLite store 并执行 migration，再开始服务；
  这一步失败进程会直接退出（compose 会按重启策略重试）。

## 3. 最小部署步骤

```bash
# 1) 显式提供 secret（不要依赖 compose 默认值）
export BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
export BETTER_AUTH_URL="https://tocsin.example.com"   # 生产必须，或改用 SERVER_URL
export SERVER_URL="https://tocsin.example.com"
# 或者：把同一个值写成单行文件，挂载后改用
#   export BETTER_AUTH_SECRET_FILE=/run/secrets/tocsin_auth_secret
# 内联值优先；两者都为空时生产环境仍然拒绝启动。

# 2) 构建并启动
docker compose up -d --build

# 3) 等就绪并确认健康
curl -fsS http://127.0.0.1:3000/api/ready
docker compose ps
docker compose logs --tail=50 console
```

**立即完成首次 setup。** 打开 `https://<你的域名>/setup`，用第一个账号完成 owner 注册：第一个注册用户自动
成为 owner，之后任何新的用户创建都会被拒绝（`Owner user already exists`）。当前版本没有邀请、用户管理或
注册开关，所以**在把地址暴露给公网之前先完成 setup**，否则先访问的人就会拿到 owner。

## 4. 环境变量

应用读 `process.env` + Vite 环境，`apps/console/src/env.ts` 是唯一 schema。容器内默认值如下：

| 变量                              | 默认值（容器内）      | 作用与约束                                                                 |
| --------------------------------- | --------------------- | -------------------------------------------------------------------------- |
| `HOST` / `PORT`                   | `0.0.0.0` / `3000`    | Nitro node-server 监听地址与端口（镜像里已设）                             |
| `BETTER_AUTH_SECRET`              | 无（compose 回落为空） | 生产**必需**（或改用 `BETTER_AUTH_SECRET_FILE`）：≥32 字符，且不能是占位值或历史公开值；缺失/占位时所有请求（含 `/api/ready`）返回 500，容器被判 unhealthy |
| `BETTER_AUTH_SECRET_FILE`         | 无                    | 可选：从文件读取同一个 secret。`BETTER_AUTH_SECRET` 非空时忽略；文件须为**单行裸值**、≤4 KiB、对 uid/gid 1000 可读；缺失/不可读/空文件/多行都会让启动失败，错误只含变量名、路径与 errno |
| `BETTER_AUTH_URL`                 | 无                    | 生产**必需**（或提供 `SERVER_URL`）：Better Auth 的对外 base URL，必须是合法 URL |
| `SERVER_URL`                      | 无                    | 对外访问 URL；`BETTER_AUTH_URL` 缺省时作为回落值，并用于生成告警模板里的 `tocsin.eventUrl` 事件直链（未设置时回落到 `BETTER_AUTH_URL`） |
| `BETTER_AUTH_ALLOWED_HOSTS`       | 无                    | 可选，逗号/换行分隔的 Host 白名单（走 PVC、反代、临时域名时使用）           |
| `BETTER_AUTH_TRUSTED_ORIGINS`     | 无                    | 可选，逗号/换行分隔的额外可信 Origin（CSRF/origin 检查）                    |
| `TOCSIN_DATABASE_PATH`            | `/data/tocsin.sqlite` | SQLite 文件路径；应用自身缺省是 `<cwd>/data.sqlite`，容器里由镜像覆盖       |
| `TOCSIN_DESTINATION_TIMEOUT_MS`   | `10000`               | 出站投递 HTTP deadline，范围 1–30000；compose 未透传，需 override 才能设置  |
| `TOCSIN_LOG_LEVEL`                | `info`                | `trace` / `debug` / `info` / `warning` / `error` / `fatal` / `off`          |
| `TOCSIN_LOG_FORMAT`               | `auto`                | `auto` / `json` / `text`；production build 下 `auto` 输出 JSON Lines        |
| `TOCSIN_MAX_WEBHOOK_BYTES`        | `1048576`（1 MiB）    | 入站 webhook 上限，最大 `10485760`（10 MiB）                                |
| `TOCSIN_WORKER_BATCH_SIZE`        | `10`                  | 每批投递数，最大 100                                                        |
| `TOCSIN_WORKER_INTERVAL_MS`       | `5000`                | worker 轮询间隔，最大 60000                                                 |
| `TOCSIN_WORKER_STALE_RUNNING_MS`  | `300000`              | `running` 超时回收窗口，最大 3600000                                        |
| `VITE_APP_TITLE`                  | 无                    | 可选，目前只在 `env.ts` 里声明，仓库中没有读取点（未发现使用）               |

只在 compose / entrypoint 层面存在、应用代码不读的变量：

| 变量                | 位置                  | 作用                                                            |
| ------------------- | --------------------- | --------------------------------------------------------------- |
| `TOCSIN_HTTP_PORT`  | `docker-compose.yml`  | 只决定宿主机映射端口（容器内始终是 3000）                        |
| `TOCSIN_DATA_DIR`   | `scripts/docker-entrypoint.sh` | 覆盖 entrypoint 需要 chown 的目录；缺省取 `TOCSIN_DATABASE_PATH` 的目录，再缺省 `/data` |

还有一类只在配置导入/导出里出现的环境变量引用：导出 TOML/JSON 时，secret 字段会被替换成
`TOCSIN_SOURCE_<SOURCE_ID>_<FIELD>`、`TOCSIN_DEST_<DESTINATION_ID>_<FIELD>`、
`TOCSIN_FEISHU_APP_<APP_RECORD_ID>_APPSECRET`（用应用记录的 id，不是飞书 app_id）这类变量名；ID 与字段名
会被转成大写、非字母数字字符替换成 `_`（例如 `app-1` → `APP_1`）。导入时从进程环境取这些变量的值。它们
不是部署开关，但部署环境里需要能看到它们，导入才能拿到明文 secret。

## 5. 反向代理与 TLS

应用**不做 TLS 终止**（Nitro 的 `NITRO_SSL_CERT` / `NITRO_SSL_KEY` 按其官方文档只用于测试）。生产做法是在
前置反向代理（nginx、Caddy、Traefik 等）终止 TLS，再把请求转给容器的 3000。

- 反向代理指向 `http://127.0.0.1:3000`（或同一 Docker 网络里的 `console:3000`）。
- **建议把 compose 的端口映射改成只绑本机**，例如
  `"127.0.0.1:${TOCSIN_HTTP_PORT:-3000}:3000"`；当前文件默认发布在所有网卡上，这是文档层面的建议，
  仓库没有替你改。
- 反代侧不要设置低于 `TOCSIN_MAX_WEBHOOK_BYTES` 的请求体上限，否则告警载荷会在到达应用前被截断。
- 外部访问 URL 必须写进 `BETTER_AUTH_URL` / `SERVER_URL`：仓库里没有自定义的 `X-Forwarded-*` 处理代码，
  应用不会自己推断外部协议和域名。通过多个 Host（PVC、临时域名、内网 + 外网）访问时，额外配置
  `BETTER_AUTH_ALLOWED_HOSTS` 与 `BETTER_AUTH_TRUSTED_ORIGINS`。
- **注意：compose 文件目前不透传这两个变量。** 使用它们需要自建 `docker-compose.override.yml`（或直接改
  你的部署清单）把 `BETTER_AUTH_ALLOWED_HOSTS` / `BETTER_AUTH_TRUSTED_ORIGINS` 加进 `environment`。
- 只有代理端口对外；容器端口保持在内网。应用没有 WAF。登录与 auth 端点由 Better Auth 的内置限流
  保护：production 默认启用（10 秒 100 次，`/sign-in/email` 额外限制为 10 秒 3 次）。计数器默认在
  进程内存中，单进程部署下有效；重启会清空。代理层仍应承担全局限流、可信 IP 头与整体防护。

## 6. 数据卷

- 唯一持久状态是 `/data` 里的 SQLite 文件：`tocsin.sqlite`，WAL 模式下还会有
  `tocsin.sqlite-wal` 和 `tocsin.sqlite-shm`。
- 生产请用命名卷或显式 bind mount；Dockerfile 的 `VOLUME ["/data"]` 在没有显式挂载时会产生匿名卷，
  重建容器时容易丢数据。
- 卷里包含 secret（通知目标凭证、飞书应用 `app_secret`、Source 共享密钥），因此**卷的备份也按密钥保管**；
  详见 `docs/release/backup-restore-upgrade.md`。
- 不要用 NFS 之类的网络文件系统承载 SQLite；单机本地卷是设计前提。

## 7. Secrets

- **必须显式提供 `BETTER_AUTH_SECRET`。** compose 不再内置任何默认值：未设置时为空，应用加载入口时以
  `BETTER_AUTH_SECRET is required in production (set BETTER_AUTH_SECRET or BETTER_AUTH_SECRET_FILE)`
  拒绝服务，所有请求（包括 `/api/ready`）返回 500、healthcheck 判 unhealthy，不会出现「健康但登录 500」
  的假绿。生成一次并持久化复用，不要每次部署都重新生成：
  ```bash
  openssl rand -hex 32   # 写入受保护的 .env（已 gitignore）或编排平台的 secret
  ```
  历史 compose 默认值与 `.env.example` 旧值都已加入黑名单。轮换 secret 会让所有 dashboard session
  失效，用户需要重新登录；数据库与其他配置不受影响。
- **也可以从文件读取：`BETTER_AUTH_SECRET_FILE`。** 内联值优先；只有 `BETTER_AUTH_SECRET` 为空时才读文件。
  文件必须是**单行裸值**（不要 `KEY=value`、不要引号、不要注释、不要 PEM），不超过 4 KiB，结尾换行会被
  去掉，内部换行会被拒绝。缺失、不可读、空文件都会让应用拒绝提供服务（首个请求即失败，`/api/ready`
  返回 500），错误信息只包含变量名、路径与 errno，不会打印内容；服务端不会把读到的值写回
  `process.env`。
- Compose 的最小接线（`docker-compose.override.yml`）：`secrets:` 负责把文件挂到 `/run/secrets/<name>`，
  `environment` 负责告诉应用去读它。只设 `BETTER_AUTH_SECRET_FILE` 而不挂载文件必然得到 `ENOENT`。
  ```yaml
  services:
    console:
      environment:
        BETTER_AUTH_SECRET: ""
        BETTER_AUTH_SECRET_FILE: /run/secrets/tocsin_auth_secret
      secrets:
        - tocsin_auth_secret

  secrets:
    tocsin_auth_secret:
      file: ./secrets/tocsin_auth_secret
  ```
- **权限模型取决于编排方式**，不要把「支持 Docker secret」当成一句话承诺：
  - `docker compose` 的非 Swarm `secrets:`：以文件挂载到 `/run/secrets/<name>`，默认 `root:root` `0444`，
    容器内 uid 1000 可读。
  - Docker Swarm：只有 `docker stack deploy` 使用 secret store；`docker compose up` 不会读取 Swarm secret。
    挂载为 tmpfs，默认 `0444`。
  - Kubernetes：Secret 卷默认 `0644`，可读；若改成 `0400`，必须同时配置 `fsGroup: 1000` /
    `runAsGroup: 1000`，否则 `node` 用户读不到。卷内的 `..data` symlink 可以正常读取。
  - 宿主 bind mount：文件必须对 uid/gid 1000 可读（entrypoint 只 chown `/data`，不会 chown secret 文件）。
  - 轮换 secret 后需要重启容器（`docker compose restart console`），运行中的进程不会重读文件。
- 使用 `_FILE` 时，`docker inspect` / `docker compose config` 里只有路径，没有明文；但明文仍然存在于进程
  内存中。应用不实现外部 secret manager 协议，也不支持其他变量的 `_FILE`。
- 配置导入/导出用的 `TOCSIN_SOURCE_*` / `TOCSIN_DEST_*` / `TOCSIN_FEISHU_APP_*` 引用**仍然只读
  `process.env`**，不支持 `_FILE`。
- 不要把 secret 打进镜像：`.dockerignore` 已排除 `.env` 与 `.env.*`（保留 `.env.example`）。
- 持久化 secret（目标 URL、邮件密码、飞书 app secret 等）保存在 `/data` 的 SQLite 里；导出 TOML/JSON 时
  默认用环境变量引用替换明文 secret，导入时再从环境变量读取。

## 8. 健康检查与观测

| 端点          | 语义      | 行为                                                                        |
| ------------- | --------- | --------------------------------------------------------------------------- |
| `/api/health` | liveness  | 恒返回 200 `{"status":"ok"}`，不检查依赖                                     |
| `/api/ready`  | readiness | 返回 `{"status":"ok","checks":{"sqlite":"ok","migrations":"ok","worker":"ok"}}`；任一项失败时 503 |

- 用 `/api/ready` 做容器健康检查和发布判断；`/api/health` 只适合“进程还在不在”。
- 成功访问 `/api/health`、`/api/ready` 的请求日志被降级为 `debug`，避免探针污染常规日志。
- 日志输出到 stdout/stderr：production 下 `TOCSIN_LOG_FORMAT=auto` 是 JSON Lines，可由 Docker 或外部
  采集器收集；应用不写本地日志文件，也不把运行日志写进业务库。分类、级别与脱敏规则见
  `docs/architecture/observability.md`。

## 9. 日常运维入口

- 备份、恢复、升级、回滚：`docs/release/backup-restore-upgrade.md`。
- 发布前的验收路径：`docs/release/mvp-rc-checklist.md`。
- 配置导入/导出（TOML/JSON、secret 用环境变量引用）：console 的 Settings 页面。
