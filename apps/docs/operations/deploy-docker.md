# Docker 生产部署

Tocsin 的默认部署拓扑是**一个应用容器、一个持久数据卷、一个 SQLite 数据库文件**。当前仓库状态仍是可试用的自托管 MVP，并非稳定发布版；生产部署前请先完成备份恢复演练。

## 部署前准备

- 准备可持久化的 `BETTER_AUTH_SECRET`，可使用 `openssl rand -hex 32` 生成。生产环境未设置有效密钥时会拒绝正常提供服务。
- 准备实例唯一的外部访问 URL。`BETTER_AUTH_URL` 是认证 base URL；`SERVER_URL` 用于对外链接，未设置时部分场景回落到认证 URL。
- 准备持久化本地卷。Compose 默认卷名为 `tocsin-data`，容器内 SQLite 默认路径是 `/data/tocsin.sqlite`。该卷含通知目标凭证等敏感配置，备份按密钥材料保护。
- 准备反向代理终止 TLS。容器只提供 HTTP；应用不替代 TLS 代理，也不会自动推断代理后的外部 URL。

## 启动与首次 setup

从仓库根目录部署时，Compose 会构建本地镜像：

```bash
export BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
export BETTER_AUTH_URL="https://tocsin.example.com"
export SERVER_URL="https://tocsin.example.com"
docker compose up -d --build
curl -fsS http://localhost:3000/api/ready
docker compose ps
```

请替换示例域名，并在部署编排中安全保存密钥；示例导出的 shell 变量不是持久 secret store。Compose 默认把容器端口发布到主机所有网卡。若仅由同机反向代理访问，可在自己的 Compose override 中将主机绑定限制到 loopback，并确认代理可连到该端口。

在开放外部访问前立即完成 `/setup`。第一个注册用户成为 owner；实例不提供「让公网访问者先注册、稍后再关」的安全缓冲。首次 setup 完成后再通过 TLS 代理开放 dashboard 与 webhook。

首个 owner 的创建条件、登录会话管理与密码边界见[认证与账号安全](/operations/authentication)。

## 反向代理与限制

- 代理终止 TLS，并将 HTTP 请求转发到容器端口。应用没有内置 TLS 终止。
- nginx/Caddy 的完整配置、Host/客户端 IP 边界、请求体校验与上线检查见 [TLS 反向代理](/operations/reverse-proxy)。
- 明确设置 `BETTER_AUTH_URL` 与 `SERVER_URL` 为外部访问地址。通过其他 Host 或 Origin 访问时，按需配置 `BETTER_AUTH_ALLOWED_HOSTS` 与 `BETTER_AUTH_TRUSTED_ORIGINS`；当前 Compose 未透传这两个变量，可用自有 override 补充。
- 代理的请求体上限不可低于 `TOCSIN_MAX_WEBHOOK_BYTES`（默认 1 MiB，最大 10 MiB），否则 payload 可能在到达应用前被拒绝。
- 单机本地卷是默认数据面；不支持多实例写入同一 SQLite 文件，不建议使用 NFS 等网络文件系统承载数据库。
- Docker healthcheck 使用 `/api/ready`。`/api/health` 只表示进程存活，不检查 SQLite、迁移或 Worker。

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

下一步：[环境变量与运行时配置](/operations/configuration) · [认证与账号安全](/operations/authentication) · [备份与恢复](/operations/backup-restore) · [版本升级与回滚](/operations/upgrade-rollback) · [健康检查和告警链路排障](/operations/troubleshooting)
