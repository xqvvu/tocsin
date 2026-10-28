---
title: 版本升级、回滚与数据库兼容性
description: Tocsin 镜像升级、SQLite forward-only migration、readiness 失败判读与版本回退决策。
---

# 版本升级、回滚与数据库兼容性

升级 Tocsin 不只是替换镜像 tag。应用首次打开 SQLite 数据库时会执行尚未应用的 migration，数据库变更只向前推进，没有自动 downgrade。本页用于判断能否升级、何时只能恢复备份，以及升级后怎样验收。

冷备份、恢复和数据库文件的保管要求见[备份与恢复](/operations/backup-restore)。不要用可移植配置代替数据库备份：TOML/JSON 不包含 Event、Delivery、用户、session 或 Source Token。

::: warning 先固定版本再操作
生产部署应固定到明确的版本 tag，并保留升级前的镜像与冷备份。不要对生产数据直接使用 `latest`、`main` 构建或会被下一次构建覆盖的本地 tag，否则无法可靠回滚。
:::

## 兼容性模型

- migration 按版本顺序执行；数据库中已记录的版本会跳过，未记录的版本会在启动阶段应用。
- 如果数据库包含当前镜像不认识的 migration，应用会拒绝就绪。旧镜像不认识新台账时，换回镜像不会成功。
- migration 台账正常也不保证业务数据完全兼容。新版本写入的新状态、新枚举或新语义可能无法被旧代码正确处理，因此回滚前必须阅读目标版本的 release notes。
- readiness 通过只说明 SQLite、migration 和 Worker 已启动，不代表 Route 已命中或通知目标已经送达。

| 场景 | 升级时发生什么 | 回退判断 |
| --- | --- | --- |
| 新旧版本 migration 集合相同 | 跳过全部 migration | 数据形状未变时可直接换回旧镜像；仍需阅读 release notes |
| 新版本增加了 migration | 首次打开数据库时应用新增步骤 | 旧镜像可能返回 `migration_unknown`；默认恢复升级前备份 |
| 新版本改变了状态或数据语义 | migration 可能仍相同 | 只看 readiness 无法证明兼容；默认恢复备份 |
| migration 执行失败 | readiness 返回 `migration_failed` | 停止继续变更，保全数据库与日志，再决定修复或恢复 |

## 当前 migration 台账

以下内容核对到 `v0.1.0-beta.122`。升级其他版本时，以该版本 release notes 和 `schema_migrations` 实际内容为准。

| 版本 | 变更摘要 | 回退注意 |
| --- | --- | --- |
| `0001` | 初始 schema baseline | 只能由包含 `0001` 的镜像读取 |
| `0002` | 告警静默表 | 旧镜像必须认识 `0002` |
| `0003` | 修复旧库缺失的表、列和索引；旧投递表结构过旧时会保留数据重建 | 可重复执行；旧表缺少必需列时 migration 失败 |
| `0004` | 加急呼叫新增 nullable 的拨号意图列，不回填；null 表示未确认拨号，可安全重试 | beta.89 及更早版本不认识该台账 |
| `0005` | 投递健康聚合的覆盖索引，不修改数据；启动阶段同步建索引，耗时随投递行数增长 | beta.102 及更早版本不认识该台账 |

根据已发布 release notes，一个简化版本边界是：

- `v0.1.0-beta.89` 及更早：migration plan 到 `0003`。
- `v0.1.0-beta.90` 至 `v0.1.0-beta.102`：migration plan 到 `0004`。
- `v0.1.0-beta.103` 及之后：migration plan 到 `0005`；截至 beta.122 没有再增加 migration。

这些边界只用于识别升级前风险。不要从版本号推断某个具体提交的数据兼容性；以对应 tag 的 release notes 为准。

## 升级前检查

1. 从部署清单记录当前镜像、Compose/override 文件、目标版本和计划回滚版本。
2. 阅读目标版本的 release notes，逐项确认 migration、环境变量、配置格式、接口和回滚限制。
3. 完成一次冷备份。容器停止后复制同一个快照中的主库、`-wal` 与 `-shm` 文件，并按[校验备份](/operations/backup-restore#校验备份)确认可读。
4. 用 SQLite 工具读取备份中的 migration 台账，确认当前数据库版本。下面假设 `$BACKUP_DIR` 是上一页生成的快照目录：

```bash
sqlite3 "$BACKUP_DIR/tocsin.sqlite" \
  "SELECT version FROM schema_migrations ORDER BY version; PRAGMA integrity_check;"
```

`integrity_check` 应返回 `ok`。runtime 镜像不包含 `sqlite3` CLI，校验通常要在宿主机或带工具的临时环境中完成。备份内容等同密钥材料，应限制访问并加密传输。

5. 在维护窗口内执行升级；不要让多个 Tocsin 实例同时打开同一个 SQLite 文件。

## 执行升级

修改 Compose/override 中的镜像 tag，先做配置语法检查，再重建容器：

```bash
docker compose config --quiet
docker compose up -d
```

修改镜像或环境映射后使用 `up -d`，不要只用 `docker compose restart`。后者不会应用 Compose 文件中的新镜像或环境值。

::: warning 不要用 `up -d --build` 升级
`--build` 会从当前源码重建并覆盖本地镜像 tag，绕过你记录的版本镜像，回滚时没有旧镜像可用。
:::

首次启动可能执行 migration。大表上的索引构建会延长就绪时间；在确认日志仍在推进前，不要反复重启或并发启动第二个容器。

```bash
for attempt in $(seq 1 30); do
  if curl -fsS http://localhost:3000/api/ready; then
    break
  fi
  sleep 5
done

docker compose ps
docker compose logs --tail=100 console
```

日志中的 `tocsin.runtime` 启动信息会显示应用版本。设置页的「运行时与生效参数」也应显示预期版本；它不能替代 migration 台账与业务链路验收。

## 升级后验收

1. `/api/ready` 返回 `200`，`checks.sqlite`、`checks.migrations`、`checks.worker` 均为 `ok`。
2. 容器保持 running，日志没有 `migration_failed`、未知 migration 或 Worker 启动错误。
3. 能登录 dashboard，并能看到升级前的告警源、路由、通知目标与最近数据。
4. 发送一次测试 Webhook，确认 Event 入库、Route 命中并产生新的 Delivery。
5. 观察至少一个 Worker 周期，确认投递进入结束状态，没有长期停在 `running`。
6. 如果升级涉及飞书电话加急，再按[飞书应用与电话加急](/integrations/feishu-app#上线验收)补做人工验收。

任何一项失败都应停止继续变更。若 readiness 失败，先读取固定 `code`，不要删除数据库或 `schema_migrations` 来“重试”。

## 回滚决策

### 只回退镜像

只有同时满足以下条件时，才考虑直接换回旧镜像：

- 旧镜像认识当前数据库中的全部 migration version；
- 目标版本 release notes 没有说明不兼容的状态、配置或数据语义；
- 已保留当前数据库与日志，出现问题仍可恢复升级前备份。

将镜像 tag 改回已验证的旧版本，执行 `docker compose up -d`，再重复升级后的 readiness、登录和告警链路验收。

### 恢复升级前备份

这是数据库已经写入旧版本不认识的数据时的默认方案。恢复会把配置、Event、Delivery 和 session 回退到备份时间点，升级后的写入会丢失。停止容器、恢复同一快照的主库与 WAL 伴生文件、启动旧镜像，具体命令见[备份与恢复](/operations/backup-restore#恢复)。

恢复后不能只看容器是否 running，必须重新确认 `/api/ready`、登录与一条完整投递链路。

### 已明确验证的台账调整

`/api/ready` 返回 `migration_unknown` 时，说明数据库台账含有旧镜像不认识的版本。常规处理是恢复升级前备份。

历史上只有两个明确记录、且在发布流程中验证过的反向路径：

- beta.90 回滚到 beta.89：数据库已记录 `0004`，但 beta.89 只认识到 `0003`。
- beta.103 回滚到 beta.102：数据库已记录 `0005`，但 beta.102 只认识到 `0004`。

这两种情况下，旧版本无需读取相应新增对象：`0004` 是 nullable 列，`0005` 是独立索引。只有在已经完成冷备份、核对目标版本 release notes，并确认没有其他 schema/数据不兼容后，才可以停止应用，用 SQLite 工具对数据库执行对应的台账删除：

```sql
-- 仅用于 beta.90 -> beta.89；其他版本不要套用。
DELETE FROM schema_migrations WHERE version = '0004';

-- 仅用于 beta.103 -> beta.102；其他版本不要套用。
DELETE FROM schema_migrations WHERE version = '0005';
```

新增的列或索引可以保留；再次升级时对应 migration 会幂等补回并重新记录。不要因为任意 migration 失败就删除台账行，也不要在容器仍运行时直接修改数据库。

## readiness 判读

| `code` | 含义 | 升级/回滚时的动作 |
| --- | --- | --- |
| `migration_unknown` | 数据库含当前镜像不认识的 migration | 通常是新旧镜像不匹配；恢复备份，或按已验证的特定回退路径处理 |
| `migration_failed` | migration 执行失败 | 停止继续操作，保全数据库与日志；按 release notes 修复或恢复升级前备份 |
| `store_unavailable` | SQLite 无法打开 | 检查数据卷、属主、权限和磁盘空间 |
| `worker_unavailable` | 数据库已就绪但 Worker 无法启动 | 查看启动日志与 `tocsin.worker.*` 错误，不要只重启容器 |

启动阶段 storage bootstrap 失败时，容器可能仍在 running。普通请求返回 `500`，只有 `/api/ready` 返回结构化 `503`；原始错误（含数据库路径与 migration 版本）只写日志，不进入响应。`code` 与 `checks` 的对应关系是固定的：

| `code` | `checks` |
| --- | --- |
| `migration_unknown` | `sqlite: ok`、`migrations: error`、`worker: skipped` |
| `migration_failed` | `sqlite: ok`、`migrations: error`、`worker: skipped` |
| `store_unavailable` | `sqlite: error`、`migrations: skipped`、`worker: skipped` |
| `worker_unavailable` | `sqlite: ok`、`migrations: ok`、`worker: error` |

`migration_unknown` 时，日志会给出具体版本，可直接用于回滚判断：

```text
SQLite database has applied migrations not present in this build: 0004
```

`restart: unless-stopped` 不会因为 unhealthy 自动重启。不要等待它自愈，也不要并发启动第二个实例。

::: tip 记录演练结果
至少记录当前版本、目标版本、备份位置、migration 前后台账、readiness 响应、旧镜像 tag 和验收时间。没有在隔离环境验证过恢复时，不要把“备份文件存在”当作可回滚证明。
:::

相关页面：[备份与恢复](/operations/backup-restore) · [Docker 生产部署](/operations/deploy-docker) · [日志与可观测性](/operations/observability#健康检查、worker-状态与投递健康) · [故障排查](/operations/troubleshooting) · [项目 Release notes](https://github.com/xqvvu/tocsin/releases)
