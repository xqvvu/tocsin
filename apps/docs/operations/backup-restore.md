# 备份、恢复与升级

Tocsin 的持久状态集中在 SQLite 数据库中，Docker Compose 默认文件为 `/data/tocsin.sqlite`。数据库里包含告警源共享密钥、通知目标凭证、配置、dashboard 用户与会话等，因此备份文件应视同 secret 管理：限制访问、加密传输与存储，并设置受控保留期。

如果目标只是迁移告警源、通知目标、路由、飞书应用与基础设置，可使用[可移植配置参考](/operations/portable-config)导出 TOML 或 JSON。它不会包含历史事件、投递、告警静默、用户、session 或 Source Token，因此不能替代数据库备份。

## 冷备份

最容易审计的方式是在维护窗口停止应用，再复制数据库文件。以下示例将数据库从 Compose 服务复制到主机；先确认本机已安装 `sqlite3`。

```bash
BACKUP_DIR="$PWD/backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
docker compose stop console
docker compose cp console:/data/. "$BACKUP_DIR/"
sqlite3 "$BACKUP_DIR/tocsin.sqlite" 'PRAGMA integrity_check;'
docker compose start console
```

完整性检查应输出 `ok`。若采用文件系统快照或其他方式一并复制 `-wal`、`-shm` 伴生文件，三个文件必须来自同一时点；不要在运行中的 WAL 数据库上只复制主文件。在线备份应使用 SQLite online backup API（例如 `.backup` 或 `VACUUM INTO`），而不是直接复制正在使用的文件。Tocsin runtime 镜像不包含 `sqlite3` CLI。

定期在隔离环境验证备份可读并演练恢复。单有备份文件而未验证恢复，不构成可用的恢复方案。

## 恢复

恢复会丢失备份时间点之后的 Event、Delivery 与配置变化。先停止服务，确保目标卷上没有其他 Tocsin 进程，再用同一快照替换数据库及其 WAL 伴生文件（快照中存在时）：

```bash
docker compose stop console
docker compose cp "$BACKUP_DIR/tocsin.sqlite" console:/data/tocsin.sqlite
if [ -f "$BACKUP_DIR/tocsin.sqlite-wal" ]; then
  docker compose cp "$BACKUP_DIR/tocsin.sqlite-wal" console:/data/tocsin.sqlite-wal
fi
if [ -f "$BACKUP_DIR/tocsin.sqlite-shm" ]; then
  docker compose cp "$BACKUP_DIR/tocsin.sqlite-shm" console:/data/tocsin.sqlite-shm
fi
docker compose start console
curl -fsS http://localhost:3000/api/ready
```

启动前确认目标卷没有遗留与该快照不一致的 `-wal` / `-shm` 文件。三个文件必须来自同一快照，不能把旧 WAL 配到新主库。启动后检查 `/api/ready`、登录 dashboard，并抽查告警源、路由、通知目标及最近的事件和投递。

## 升级

数据库 schema 通过启动时执行的 forward-only migrations 升级。升级前阅读目标版本的 release notes，确认是否包含 schema 变更，并先完成并验证冷备份；保留旧镜像版本，升级后检查 readiness 与主告警链路。

```bash
# 已完成备份后，将 Compose 配置切换到目标镜像/版本，再执行：
docker compose up -d
curl -fsS http://localhost:3000/api/ready
docker compose logs --tail=100 console
```

只有 readiness 正常、能登录并验证一次 webhook → Event → Delivery 流程后，才算通过本次升级验收。部署代码构建与镜像来源取决于你的发布方式；不要假设本仓库每个提交都有可用的预构建镜像。

## 回滚

优先使用升级前保留的镜像 tag 回退，并检查旧版本是否兼容已应用的 migrations 与新版本写入的数据。若旧版本不认识数据库已记录的 migration，单纯切回镜像可能不能恢复服务；此时不要手工删除 migration 台账记录。应先保全当前数据库和日志，再依据版本发布说明选择兼容方案或恢复升级前备份。

::: warning 迁移文件不可原地改写
已应用的 migration 会按版本跳过。已部署实例的 schema 变更应通过新的 forward migration 发布，而不是改写旧 migration 文件。
:::

Delivery history 当前不会自动清理；原始 payload 则按 dashboard 设置中的保留天数清理。请把持续增长的数据库容量和敏感备份保留纳入例行检查。

更多：[Docker 生产部署](/operations/deploy-docker) · [项目 Release notes](https://github.com/xqvvu/tocsin/releases)
