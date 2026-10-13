# 备份、恢复、升级与回滚

> 一句话结论：要备份的只有 `/data` 里的一个 SQLite 文件（外加 WAL/SHM 两个伴生文件）；升级与回滚的正确
> 顺序是"先冷备份、再换镜像"；而当前 **migration 只有一个 baseline，runner 会跳过已应用的版本**，所以
> **原地修改 baseline 对任何已有数据库都是 no-op** —— 这不是异常，是必须按事实处理的升级约束。

核实时间 2026-10-13，核实基线 `origin/main` @ `4e17c28`。相关文件：
`apps/console/src/infra/sqlite/connection.ts`、`apps/console/src/infra/sqlite/migrate/{plan,runner}.ts`、
`apps/console/src/infra/sqlite/migrate/schema.ts`、`Dockerfile`、`scripts/docker-entrypoint.sh`。
部署形态与变量见 `docs/release/docker-production-deployment.md`。

## 1. 数据面事实

- **唯一持久状态是一个 SQLite 文件**：容器内默认 `/data/tocsin.sqlite`（镜像里的 `TOCSIN_DATABASE_PATH`）。
  WAL 模式下同目录还有 `tocsin.sqlite-wal` 与 `tocsin.sqlite-shm`。
- 连接参数：`journal_mode = WAL`、`busy_timeout = 5000`、`foreign_keys = ON`
  （`infra/sqlite/connection.ts`）。
- 所有东西都在这个库里：Sources、Routes、Destinations、Events、Deliveries、Feishu apps、Oncall ping、
  Suppressions、Settings，以及 Better Auth 的用户与 session 表。worker 队列也在这个库里 —— 没有外部
  队列、没有上传目录、应用也不写本地日志文件。
- 库里有 secret：通知目标配置（webhook URL、SMTP 密码、飞书应用 `app_secret`）、Source 共享密钥。
  **备份文件等同密钥文件**，注意传输与存放权限。
- `schema_migrations` 是迁移台账，runner 有两条硬规则（`migrate/runner.ts`）：
  1. 已经记录过的 version → **跳过**，不重跑。
  2. 库里存在当前构建不认识的 version → 直接抛错
     `SQLite database has applied migrations not present in this build: <versions>`，进程启动失败。
- 当前 plan 只有一个条目：`0001_initial_schema`（`migrate/plan.ts`）。

## 2. Migration 现状：单一 baseline 会被原地修改

`docs/architecture/sqlite-store.md` 明确说明：稳定版本发布前，整个 schema 收敛在
`migrate/0001_initial_schema.ts` 这一个 baseline 里，发布后才切回 forward-only migration。这意味着
**baseline 在发布前是被原地编辑的**，而不是靠新 migration 演进。

这不是推测，仓库里有实例：2026-10-12 的 `d6b4b58`（feat(console): add suppressions table and delivery
suppression columns）在 `migrate/schema.ts` 里加了 `suppressions` 表与 delivery 的抑制列，**没有新增任何
migration 文件**；`migrate/` 目录下至今只有 `0001_initial_schema.ts` 一个版本。

因此升级行为分成两种，必须分开对待：

| 场景                              | 行为                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| 全新数据库                        | baseline 全量执行，schema 与当前代码一致                                                          |
| 在 baseline 被修改**之前**创建的库 | `schema_migrations` 里已经有 `0001`，runner 跳过，新表/新列**不会**被创建；启动能通过（迁移检查只看版本号），第一次读写缺失对象时才报运行时错误 |

所以"升级镜像"在今天**不等于**"升级数据库"。

### 现在能做的处理

- 开发 / 试用环境：删库重建是最省事的做法，**但这是破坏性操作**。重建前先导出配置（Settings 页面的
  TOML/JSON 导出），重建后重新 setup 再导入；`docker compose down -v` 会删掉命名卷 `tocsin-data`，
  只有在确认数据可以丢弃时才用它。
- 自托管生产环境：今天**没有**自动路径。可选做法只有"重建"或人工补 schema，仓库里没有任何补表工具或
  校验命令；这就是为什么首个稳定版本之前必须冻结 baseline。
- 第一个稳定版本发布后要恢复 forward-only migration（`sqlite-store.md` 的既定计划）。那一天起升级/回滚
  语义会改变，本文需要同步更新。

## 3. 备份

### 备份什么

- `/data` 目录内容：`tocsin.sqlite`、`tocsin.sqlite-wal`、`tocsin.sqlite-shm`（存在才需要）。
- 部署侧的配置文件（compose / override / env file / image tag 记录）。env file 里有 secret，单独保管。

### 冷备份（推荐，一致性最好）

```bash
BK="backups/$(date +%Y%m%d-%H%M)"
mkdir -p "$BK"

docker compose stop console
docker compose cp console:/data/. "$BK/"
docker compose start console
```

停容器后不会再有人写这个库，三个文件一次拷全，恢复时也不会出现 WAL 与主库不一致。窗口只有停止到启动的
几秒，期间 webhook 会失败（上游一般会重试）。

### 在线备份

如果不想停服务，必须用 SQLite 的在线备份接口（`sqlite3 db ".backup …"` 或 `VACUUM INTO`），**不要**直接
`cp` 正在写入的库文件：WAL 模式下主库 + `-wal` + `-shm` 是一个整体，只拷一部分会丢最近的提交。

注意运行时镜像里**没有 sqlite3 CLI**（`Dockerfile` 只安装 `gosu`、`curl`、`libatomic1`、
`ca-certificates`），需要自己准备带 sqlite3 的宿主或 helper 容器，并把 `/data` 挂进去。

### 备份校验与保留

- 用 `PRAGMA integrity_check;` 验证备份可读（同样需要 sqlite3）。
- 至少保留"上一个可用版本 + 再上一个"两份，回滚时才有的可选。

## 4. 恢复

```bash
docker compose stop console

# 用同一个快照里的三个文件覆盖回去；不要只覆盖主库而留旧的 -wal
docker compose cp "$BK/tocsin.sqlite"     console:/data/tocsin.sqlite
docker compose cp "$BK/tocsin.sqlite-wal" console:/data/tocsin.sqlite-wal   # 快照里有才拷
docker compose cp "$BK/tocsin.sqlite-shm" console:/data/tocsin.sqlite-shm   # 快照里有才拷

docker compose start console
curl -fsS http://127.0.0.1:3000/api/ready
docker compose logs --tail=50 console
```

要点：

- **三个文件必须来自同一个快照。** 旧 `-wal` 配新主库会让恢复结果不可信。
- 文件属主不用手工处理：entrypoint 以 root 起步时会 chown `/data` 与数据库三件套，然后降权到 `node`
  （uid/gid 1000）。
- 恢复后检查 `/api/ready` 的 `checks` 是否全为 `ok`，并在 UI 里抽查 Sources / Routes / Destinations /
  最近的 Events 与 Deliveries。
- 恢复是一次**数据回滚**：备份时间点之后的 Event、Delivery、配置改动都会消失。

## 5. 升级

```bash
# 1) 冷备份（见第 3 节）
# 2) 取得/构建目标版本镜像，并显式打版本 tag（没有镜像仓库，镜像只在本机）
docker build -t tocsin:0.1.0-beta.8 .

# 3) 让 compose 使用新镜像：改 compose 的 image 字段，或就地重建本地 tag
docker compose up -d --build

# 4) 确认就绪与版本
curl -fsS http://127.0.0.1:3000/api/ready
docker compose logs --tail=100 console     # 首行含 tocsin.runtime 的版本与 SQLite 信息
```

要点：

- migration 在**容器启动时**执行（server entry 顶层 `await` 打开 store 后才开始服务）。迁移失败会让进程
  直接退出，容器按 `restart: unless-stopped` 反复重启 —— 这时先看日志里的 migration 报错，别让它一直重启。
- 升级前必须读一遍本版本的 release 说明，确认是否动过 baseline（第 2 节）。动过 baseline 的版本对已有库
  是"代码升级、schema 没升级"。
- 老镜像 tag 不要删，回滚要用。

## 6. 回滚

回滚有两种，按代价从低到高尝试：

1. **只回滚镜像**（数据保留）：

   ```bash
   # 把 compose 的 image 指回上一个版本 tag（例如 tocsin:0.1.0-beta.7）
   docker compose up -d
   curl -fsS http://127.0.0.1:3000/api/ready
   ```

   什么时候可行：新旧版本读写的数据形状一致。什么时候会失败：
   - 新版写入了旧版不认识的字段/状态值（例如 `suppressed` 这样的新 delivery 状态、suppressions 表），
     旧版在运行时会报错或读到无法解释的数据；
   - 未来切到 forward-only migration 之后，如果数据库里已经记录了旧构建没有的 migration version，
     旧构建**启动就会失败**，报 `SQLite database has applied migrations not present in this build: …`。

2. **恢复备份**（数据回滚，唯一可靠方式）：按第 4 节恢复升级前的冷备份。代价是丢掉备份之后写入的全部
   数据（Event、Delivery、配置改动、session）。

不管走哪条，回滚后都要重新验证：`/api/ready` → 登录 → Source/Route/Destination 列表 → 投递一次测试
告警。

## 7. 升级检查清单

| # | 动作                                                         | 通过标准                                     |
| - | ------------------------------------------------------------ | -------------------------------------------- |
| 1 | 读本版本 release 说明，确认是否改了 baseline                  | 知道要不要重建库                             |
| 2 | 冷备份 `/data`                                                | 三个文件齐全、`integrity_check` 通过          |
| 3 | 记录当前镜像 tag 与 compose 文件                              | 能原样回滚                                   |
| 4 | 构建/获取新镜像并打版本 tag                                    | 镜像 tag 可区分版本                          |
| 5 | `docker compose up -d`                                        | 容器进入 running，日志没有 migration 报错     |
| 6 | `curl /api/ready`                                             | 200 且 `checks` 全 `ok`                       |
| 7 | 手工验收：登录、Sources、Routes、Destinations、发一条 webhook  | Event 入库、Delivery 有状态与 attempts        |
| 8 | 观察一个 worker 周期                                          | 没有卡在 `running`，没有重复投递              |

## 8. 未验证与未知

- 本仓库没有任何 E2E 或 Docker smoke 自动化（见 `docs/release/mvp-rc-checklist.md`），本文的
  `docker compose cp` / 恢复步骤是标准工具用法，**没有在真实部署上演练过**；首次生产升级请把备份校验和
  回滚演练当成独立动作。
- 在线备份的具体实现（helper 容器镜像、调度方式）没有仓库内的既定做法，需要运维自己选型。
- baseline 何时冻结、`0002+` 何时出现，目前没有排期；冻结前本文第 2 节的结论一直成立。
