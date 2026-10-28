---
title: 备份与恢复
description: 冷备份与在线备份、备份校验、恢复步骤与恢复后验收，覆盖 WAL、权限、磁盘与版本不匹配等失败模式。
---

# 备份与恢复

Tocsin 的持久状态只有一个 SQLite 数据库。配置、告警源共享密钥、通知目标凭证、dashboard 用户与会话、Event 与 Delivery 历史都在里面；Docker Compose 默认把它放在数据卷 `tocsin-data` 的 `/data/tocsin.sqlite`。

所以备份要同时回答两件事：文件是不是同一时点的一致快照，以及除了这个文件之外还缺什么。只复制主库文件不是备份，`BETTER_AUTH_SECRET` 也不在数据库里。

::: danger 备份文件等同凭据材料
数据库包含 Source Token、目标签名密钥、密码哈希、飞书应用配置与会话记录，这些值在库内是可读形式。备份文件的访问控制、传输加密与保留期必须按密钥材料管理，不要放进代码仓库、共享目录或普通工单附件。
:::

如果目标只是迁移告警源、通知目标、路由、飞书应用与基础设置，可使用[可移植配置](/operations/portable-config)导出 TOML 或 JSON。它不包含历史事件、投递、告警静默、用户、session 或 Source Token，因此不能替代数据库备份。

## 需要备份什么

| 对象 | 位置 | 说明 |
| --- | --- | --- |
| SQLite 主库 | 数据卷内的 `/data/tocsin.sqlite` | 唯一必须备份的业务数据 |
| `-wal` / `-shm` 伴生文件 | 与主库同目录 | 非正常停止时存在；冷备份必须与主库来自同一时点 |
| `BETTER_AUTH_SECRET` | 环境变量，或 `BETTER_AUTH_SECRET_FILE` 指向的挂载文件 | 不在数据卷内；恢复或迁移到新实例时必须一并准备 |
| `SERVER_URL`、代理与 Compose override | 部署仓库 | 不影响数据库内容，但决定恢复后通知直链与外部访问是否可用 |
| 容器日志 | 部署平台日志系统 | 不写入数据卷，按平台策略单独保留 |

应用只把 SQLite 写到数据卷：它不上传文件，不在运行时写本地缓存，`_FILE` 形式的 secret 由部署方挂载进来、应用只读。因此数据卷备份就是数据库备份。

`BETTER_AUTH_SECRET` 是实例级认证签名密钥。换一个值不会让数据库失效（用户与密码哈希仍在库内），但已有浏览器会话会失效，需要重新登录。把它和备份文件分开保管，两者缺一都不能原样重建实例。

## 选择备份方式

| 方式 | 一致性 | 是否停机 | 适合 | 主要代价 |
| --- | --- | --- | --- | --- |
| 冷备份 | 天然一致，易审计 | 需要 | 升级前、恢复演练、合规留档 | 维护窗口内 Webhook 与投递停止 |
| 在线备份 | 事务一致的快照 | 不需要 | 每日例行备份 | 占用 I/O；长读事务会推迟 WAL checkpoint |

两种方式产出的都是完整数据库。常见组合是每日在线备份、每次升级或改配置前额外做一次冷备份。

## 冷备份

最容易审计的方式是在维护窗口停止应用，再复制整个数据目录。以下示例将数据库从 Compose 服务复制到主机；先确认本机已安装 `sqlite3`。

```bash
BACKUP_DIR="$PWD/backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
docker compose stop console
docker compose cp console:/data/. "$BACKUP_DIR/"
sqlite3 "$BACKUP_DIR/tocsin.sqlite" \
  "PRAGMA integrity_check; SELECT version FROM schema_migrations ORDER BY version;"
docker compose start console
```

复制整个目录而不是单个文件：应用进程没有注册优雅关闭流程，`docker compose stop` 之后 `/data` 里通常仍留着 `-wal` 和 `-shm`。容器已停止，不会再有写入，这三个文件天然属于同一时点。

完整性检查应输出 `ok`。若采用文件系统快照或其他方式一并复制这三个文件，它们必须来自同一时点；不要在运行中的 WAL 数据库上只复制主文件。在线备份应使用 SQLite 的在线备份机制（`VACUUM INTO` 或 `.backup`），而不是直接复制正在使用的文件。Tocsin runtime 镜像不包含 `sqlite3` CLI。

定期在隔离环境验证备份可读并演练恢复。单有备份文件而未验证恢复，不构成可用的恢复方案。

## 在线备份

在线备份在服务运行中进行。runtime 镜像没有 `sqlite3` CLI，应用也没有备份接口，因此要在同一个数据卷上启动一个一次性工具容器，执行 SQLite 官方的 `VACUUM INTO`：

```bash
BACKUP_DIR="$PWD/backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
docker run --rm \
  -v tocsin-data:/data \
  -v "$BACKUP_DIR:/backup" \
  debian:trixie-slim \
  sh -c "apt-get update -qq && apt-get install -y -qq --no-install-recommends sqlite3 >/dev/null && sqlite3 /data/tocsin.sqlite \"VACUUM INTO '/backup/tocsin.sqlite'\""
```

关键约束：

- `VACUUM INTO` 生成**事务一致的快照**，是 SQLite 为在线数据库提供的备份方式。输出是单个自包含文件，不包含 `-wal` / `-shm`，恢复时不需要也不应该再配伴生文件。
- 目标文件必须不存在或为空。重复备份要换新的目录名，不要覆盖已有文件。
- 不要给 `/data` 加 `:ro`。WAL 模式下建立读事务需要写 `-shm`，只读挂载可能直接打开失败。
- 这个容器只执行一条读查询，不是第二个 Tocsin 实例。绝不要用类似方式同时运行两个应用实例写同一个数据库。
- 备份期间持有一个长读事务，会推迟 WAL checkpoint，`-wal` 可能暂时变大；备份结束后确认它回落。
- 目标文件系统要留出与数据库同量级的空闲空间。
- 环境无法访问软件源时，改用组织内已包含 `sqlite3` 的工具镜像，不要为此改造 runtime 镜像。

等价选择是在 `sqlite3` 交互式 shell 中执行 `.backup '/backup/tocsin.sqlite'`：它使用 SQLite 备份 API 逐页复制，结果不会压缩空页，因此文件通常比 `VACUUM INTO` 大。

## 校验备份

每次备份都要校验，并把结果记进备份清单。校验时先复制到临时目录再打开：

```bash
VERIFY_DIR="$(mktemp -d)"
cp -R "$BACKUP_DIR/." "$VERIFY_DIR/"
sqlite3 "$VERIFY_DIR/tocsin.sqlite" \
  "PRAGMA integrity_check; PRAGMA quick_check; SELECT version FROM schema_migrations ORDER BY version;"
rm -rf "$VERIFY_DIR"
```

- 不要在归档目录里直接校验。打开带 `-wal` 的副本会让 SQLite 合并 WAL 并删除伴生文件，归档文件就不再是你记录的那个快照。
- `integrity_check` 必须返回 `ok`；其他输出都意味着这次备份不可用，应丢弃并重新执行。
- 中断的 `VACUUM INTO` 可能留下不完整文件，这正是必须校验的原因。
- `schema_migrations` 的版本集合决定这个备份能被哪个版本的镜像打开，记录它。
- 同时记录备份时间、耗时、文件大小、校验和与对应镜像 tag：

```bash
(cd "$BACKUP_DIR" && shasum -a 256 *)   # macOS
(cd "$BACKUP_DIR" && sha256sum *)       # Linux
```

用 `VACUUM INTO` 得到的文件通常明显小于生产库文件，这是正常现象：它不复制 freelist 里的空闲页，已删除内容也不会进入备份。体积差异本身不是损坏证据，`integrity_check` 才是。

## 备份保留、加密与访问控制

- 备份间隔决定 RPO；恢复演练的实际耗时是 RTO 的参考值，不要凭猜测填写。
- 保留期要覆盖最长发现延迟、演练周期与合规要求。原始载荷保留 7 天而备份保留 30 天时，备份里仍可能包含约 37 天前的载荷，清理当前数据库不会追溯修改旧备份，见[数据保留与 SQLite 容量](/operations/data-retention#数据库空间指标)。
- 至少保留一份“已通过恢复演练”的备份；只保留从未打开过的文件不算。
- 用组织现有的加密方案保存（restic、borg、age、对象存储服务端加密均可），密钥与备份分开保管。备份天生含凭据，不要依赖目录权限作为唯一保护。
- 备份目录权限收紧到备份账号与少数运维，至少一份放在不同故障域。
- 备份任务失败、文件为空、校验失败或超过新鲜度阈值都应在外部监控中告警，规则见[生产监控与告警基线](/operations/monitoring)。
- 备份不包含容器日志；需要事后复盘时按平台日志保留策略单独规划。

## 恢复

恢复会把数据库整体退回到备份时点：配置、用户、会话、Event、Delivery 全部一起回退，备份之后的所有写入丢失。开始前先确认备份的 migration 版本与目标镜像兼容。

1. **确认版本**：备份的 schema 版本必须被目标镜像认识。恢复到较旧的备份、使用较新的镜像是可以的，首次打开会补跑 migration；恢复到较新的备份、使用较旧的镜像会以 `migration_unknown` 拒绝就绪。版本边界见[版本升级、回滚与数据库兼容性](/operations/upgrade-rollback#兼容性模型)。
2. **停止写入**：停止容器，确保目标卷上没有其他 Tocsin 进程。
3. **清理旧伴生文件**：删除目标卷中原有的主库与 `-wal` / `-shm`。把旧 WAL 配到新主库会造成不一致。
4. **复制同一快照的文件**：冷备份复制目录里的全部文件；在线备份只复制单个主库文件。
5. **启动并等待就绪**：启动后先看 `/api/ready`，不要只看容器是否 running。

```bash
docker compose stop console
docker compose run --rm --entrypoint sh console \
  -c 'rm -f /data/tocsin.sqlite /data/tocsin.sqlite-wal /data/tocsin.sqlite-shm'
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

默认 Compose 服务以 root 启动，entrypoint 会把 `/data` 目录以及同名主库、`-wal`、`-shm` 的属主改为 uid 1000（`node`），再用 `gosu` 降权。因此：

- 如果你在 override 中用 `user:` 以非 root 身份运行容器，这段属主修复不会发生；属主不对时 `/api/ready` 返回 `store_unavailable`，需要手工 `chown 1000:1000`。
- entrypoint 只修复这三个文件名。恢复时不要在同一目录留下别名的数据库副本，它们不会被修正权限，也容易被下一次误用。

启动后检查 `/api/ready`、登录 dashboard，并完成下面这份验收清单。

## 恢复后验收清单

恢复不是“文件拷回去就结束”。按顺序逐项确认：

1. `/api/ready` 返回 `200`，`checks.sqlite`、`checks.migrations`、`checks.worker` 均为 `ok`。
2. 能登录 dashboard；确认能读到备份时点的告警源、路由与通知目标。
3. 打开「设置 → UI → 投递急停」，确认当前状态。**备份时点如果处于暂停，恢复后仍然是暂停**，实例会安静地不发送任何投递。
4. 打开「投递」列表，核对 `pending` 数量与最早创建时间。备份时点仍在队列里的投递会被 Worker 继续发送，处理方式见下方说明。
5. 打开「设置 → 数据库存储」，核对 Event/Delivery/尝试行数与最老、最新事件时间是否与备份时点相符。
6. 打开「设置 → 运行时与生效参数」，确认版本、SQLite 版本与通知直链基址符合预期；`SERVER_URL` 配错会让消息里的链接打不开。
7. 抽查一条最近 Event 与其 Delivery，确认回执、错误与时间戳合理。
8. 按[值班交接与通知链路验收](/operations/oncall-handoff)做一次目标测试或 canary，证明链路真的通。
9. 记录备份文件、校验结果、镜像 tag、恢复耗时与异常项，作为下一次演练的基线。

::: danger 恢复会带回陈旧积压
备份时点处于 `pending` 的投递会在恢复后继续被 Worker 领取并发送，可能是几小时甚至几天前的过期告警。恢复后若不想立刻发出这些消息：

1. 先打开「投递急停」，或确认它本来就是开的。
2. 评估积压范围和最早时间。
3. 需要丢弃这批投递时，创建覆盖积压时间范围的[静默](/operations/suppressions)，让 Worker 认领时把它们转为终态 `suppressed`（保留证据、不真实发送、不产生电话加急），再恢复投递。

静默窗口必须覆盖整个排空过程，否则恢复后仍会有陈旧消息漏出。
:::

恢复还会带回备份时点的 dashboard 会话。如果备份曾离开受控环境（复制到笔记本、临时实例或第三方存储），恢复后在「设置 → UI → 账号安全」执行「退出其他设备」，并评估是否需要轮换 Source Token 与目标密钥。

## 只恢复部分配置

误删了一个告警源或路由时，不必为了一条配置回滚整个实例：

1. 把备份恢复到隔离的临时实例：使用独立的数据卷和端口，不要接入生产流量。
2. 在临时实例「设置 → TOML/JSON」导出可移植配置。
3. 在生产「设置 → TOML/JSON」用「从文件载入」+ 差异预览，只导入缺失的条目。

这条路只搬配置。可移植配置不包含 Source Token、静默、Event 与 Delivery 历史，所以导入后需要为新建的告警源准备可用的接入 Token，历史数据也无法这样搬回。临时实例的卷里有完整凭据副本，完成后连同卷一起销毁。

## 失败模式与判读

下表前三行的 `code` 来自 `/api/ready`。

| 现象 | 常见原因 | 处理 |
| --- | --- | --- |
| `store_unavailable` | 卷未挂载、属主或权限错误、磁盘已满、文件损坏 | 检查挂载点与 `chown 1000:1000`；确认磁盘余量；对文件执行 `integrity_check` |
| `migration_unknown` | 备份的 migration 台账比镜像新 | 换用匹配或更新的镜像，或恢复更早的备份；不要删除台账行 |
| `migration_failed` | migration 在恢复出的数据库上执行失败 | 停止继续变更，保全数据库与日志，按 release notes 处理 |
| 首次启动时间明显变长 | 恢复旧备份后要补跑 migration，大表上的索引构建耗时随行数增长 | 等待 readiness，不要并发启动第二个实例或反复重启 |
| 启动正常但一条投递都不发出 | 恢复带回了投递急停、停用的目标或停用的路由 | 检查「设置 → UI → 投递急停」与各对象的启用状态 |
| 恢复后收到过期通知 | 备份里的 `pending` 投递被 Worker 领取 | 先急停或用静默覆盖积压范围，再评估恢复投递 |
| 校验时 `integrity_check` 报错 | 冷备份只复制了主库、遗留旧 WAL，或在线备份被中断 | 丢弃该备份，按同一时点重新备份 |
| 备份文件远小于生产库 | `VACUUM INTO` 不复制空闲页与被删除内容 | 正常现象；以 `integrity_check` 而不是体积判断可用性 |
| 备份期间数据卷余量骤降 | WAL 增长叠加目标文件 | 预留空间；完成后确认 `-wal` 回落 |

`/api/ready` 不检查可用空间：它只验证 SQLite 能否打开、migration 与 Worker。数据卷接近写满时 readiness 仍可能返回 `200`，而接入与投递已经开始失败。容量判断必须看宿主机或数据卷的实际余量，见[数据保留与 SQLite 容量](/operations/data-retention#容量处置顺序)。

## 常见误区

| 说法 | 实际情况 |
| --- | --- |
| 目录里有 `-wal` 说明数据没落盘 | 正常现象，WAL 是运行态；关键是三个文件来自同一时点 |
| 只复制 `tocsin.sqlite` 就能冷备份 | 非正常停止时会丢掉 WAL 中的已提交事务 |
| 备份任务成功等于可以恢复 | 只证明文件存在；需要校验和演练 |
| 可移植配置可以当备份 | 不含历史、用户、session 与 Token |
| 恢复只是把文件拷回去 | 还要匹配版本、清理旧 WAL、修权限、检查暂停状态与积压 |
| 备份完成顺便在生产库上 `VACUUM` | 不要；`VACUUM` 需要独占数据库，会阻塞单进程运行 |
| 为加快备份多开一个实例连同一个库 | 绝对不要；一个实例对应一个 SQLite 文件 |

## 与升级的关系

数据库 schema 通过 forward-only migration 在启动阶段升级，已应用的 migration 会按版本跳过。升级前的备份步骤、回滚决策与 `migration_unknown` 的已验证反向路径见[版本升级、回滚与数据库兼容性](/operations/upgrade-rollback)。不要把删除 migration 台账当作通用修复，也不要把可移植配置当作数据库备份。

Delivery 历史当前不会自动清理；原始 payload 则按 dashboard 设置中的保留天数清理。请把持续增长的数据库容量和敏感备份保留纳入例行检查，清理边界与空间指标见[数据保留与 SQLite 容量](/operations/data-retention)。

相关页面：[版本升级、回滚与数据库兼容性](/operations/upgrade-rollback) · [Docker 生产部署](/operations/deploy-docker) · [数据保留与 SQLite 容量](/operations/data-retention) · [生产监控与告警基线](/operations/monitoring) · [可移植配置参考](/operations/portable-config) · [值班交接与通知链路验收](/operations/oncall-handoff) · [项目 Release notes](https://github.com/xqvvu/tocsin/releases)
