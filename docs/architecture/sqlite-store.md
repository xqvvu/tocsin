# SQLite 存储层（`apps/console/src/infra/sqlite`）

本文档说明 Tocsin console 的 SQLite 持久化层：连接组织、Kysely schema、迁移策略、
repository 分层、事务边界，以及 Better Auth schema 的生成/落库方式。

> 适用范围：`apps/console/src/infra/sqlite/`。跨包共享的领域 schema、command、
> DTO 和投影类型定义在 `@tocsin/core`；本层只负责把它们持久化到 SQLite 并读回。

---

## 1. 概述

SQLite 层是 Tocsin 的持久化适配器。对外暴露一个 `SqliteStore`，内部由 10 个 repository
组成：

- `sources`
- `destinations`
- `routes`
- `intake`
- `deliveries`
- `feishuApps`
- `oncall`
- `suppressions`
- `history`
- `settings`

当前实现是 **Kysely-first**：

- `connection.ts` 的公共入口 `createSqliteDatabase()` 返回的是 Kysely handle，命名为
  `db`。
- raw `better-sqlite3` 实例只在 `createSqliteDatabase()` 内部创建，用于
  `SqliteDialect` 和必要 PRAGMA；不会作为 Tocsin 的公共 SQLite handle 暴露。
- repository 通过 Kysely query builder 读写数据，不再手写 `prepare/run/get/all`。
- store/repository/transaction API 都是 async。
- DDL、migration ledger 和少量 SQLite 表达式使用 Kysely 的 `sql` raw capability 执行，
  不绕过 Kysely handle。

入口有两个层级：

- `createSqliteDatabase()`：创建 Kysely SQLite handle。
- `openSqliteStore()`：创建 Kysely handle、执行显式 migration、组装 repository set。

---

## 2. 设计原则

1. **Kysely 是公共数据库边界。** 调用方拿到的是 `SqliteKysely` / `SqliteExecutor`，
   raw driver 不外泄。连接创建、调用、事务和销毁都围绕 Kysely handle 组织。
2. **按聚合纵切。** 每个聚合在
   `apps/console/src/infra/sqlite/repositories/<module>/` 下拆成
   `*.interface.ts`、`*.helpers.ts`、`*.repository.ts`。
3. **MVP 使用 baseline + forward repair。** `migrate/0001_initial_schema.ts` 是全新数据库的
   完整 baseline；已部署库通过 `0002_suppressions.ts`、`0003_complete_legacy_schema.ts` 等
   forward step 补齐。所有 step 都通过 `migrateSqliteDatabase()` 执行并记录到
   `schema_migrations`；不要再把新表/新列折进已经被部署记录的 `0001`。
4. **校验只发生在真正边界。** JSON 列、enum、布尔列、写入前领域对象等跨序列化/不可信
   边界的数据做运行时校验；内部输入 DTO 和投影保持 TypeScript interface。
5. **直接触碰环境 API 的模块才加 import protection。** connection/migrate/context/store
   等 server-only 路径不能被客户端导入；纯类型文件如 `schema.ts` 不加 marker。

---

## 3. 文件结构

```txt
apps/console/src/infra/sqlite/
  connection.ts                 # 创建 Kysely SQLite handle
  schema.ts                     # Kysely database schema types
  transaction.ts                # Kysely transaction helper
  migrate/                      # SQLite schema plan（baseline + forward steps）
    0001_initial_schema.ts      # 全新库 baseline，编排下列 builder
    0002_suppressions.ts        # forward step：suppressions 表
    0003_complete_legacy_schema.ts # forward repair：对齐旧库的完整 schema
    ensure-complete-schema.ts   # 0002/0003 共享的幂等 schema 修复
    schema.ts                   # Tocsin 业务表和索引
    better-auth.schema.ts       # Better Auth 表和索引的 Kysely builder
    better-auth.generated.sql   # Better Auth CLI 生成的 schema 参考
    index.ts                    # public migration API
    runner.ts                   # schema plan runner、ledger 和校验
    plan.ts                     # 显式 schema plan registry
    types.ts                    # migration 类型和 defineSqliteMigration()
  context.ts                    # repository context、clock、id、transaction reuse
  codecs.ts                     # SQLite boolean / JSON text 物理表示 helper
  errors.ts                     # SQLite 层错误类型
  store.ts                      # repository 组装根、openSqliteStore()
  repositories/
    source/
      source.interface.ts
      source.helpers.ts
      source.repository.ts
    destination/
    route/
    intake/
    delivery/
    feishu-app/
    oncall/
    suppression/
    history/
    settings/
```

通用 JSON 编解码在 `@tocsin/core/json.ts`，不放在 SQLite 层。

---

## 4. Kysely 连接

`createSqliteDatabase(options?)` 是底层连接工厂：

```ts
export interface CreateSqliteDatabaseOptions {
  databasePath?: PathLike;
}

export function createSqliteDatabase(options?: CreateSqliteDatabaseOptions): SqliteKysely;
```

行为：

- 默认数据库路径为 `path.join(process.cwd(), "data.sqlite")`。
- 非 `:memory:` 数据库会先创建父目录。
- 内部创建 `better-sqlite3` 实例并配置：
  - `foreign_keys = ON`
  - 非内存库启用 `journal_mode = WAL`
  - 非内存库设置 `busy_timeout = 5000`
- 返回 `new Kysely({ dialect: new SqliteDialect({ database: sqlite }) })`。

关闭数据库通过 `await db.destroy()`。`OpenedSqliteStore.close()` 也只调用
`db.destroy()`。

---

## 5. Kysely Schema

`schema.ts` 定义 Kysely 的数据库形状：

```ts
export interface SqliteDatabaseSchema {
  sources: SourcesTable;
  destinations: DestinationsTable;
  routes: RoutesTable;
  events: EventsTable;
  deliveries: DeliveriesTable;
  delivery_attempts: DeliveryAttemptsTable;
  delivery_dedupe_keys: DeliveryDedupeKeysTable;
  feishu_apps: FeishuAppsTable;
  oncall_pings: OncallPingsTable;
  oncall_ping_dedupe_keys: OncallPingDedupeKeysTable;
  settings: SettingsTable;
  schema_migrations: SchemaMigrationsTable;
  user: BetterAuthUserTable;
  session: BetterAuthSessionTable;
  account: BetterAuthAccountTable;
  verification: BetterAuthVerificationTable;
}

export type SqliteKysely = Kysely<SqliteDatabaseSchema>;
export type SqliteTransaction = Transaction<SqliteDatabaseSchema>;
export type SqliteExecutor = SqliteKysely | SqliteTransaction;
```

字段类型尽量贴近领域类型，例如：

- `SourcesTable.provider: SourceProvider`
- `DestinationsTable.kind: DestinationKind`
- `EventsTable.severity: AlertSeverity`
- `EventsTable.status: AlertStatus`
- `DeliveriesTable.state: DeliveryJob["state"]`
- `DeliveryAttemptsTable.state: DeliveryAttempt["state"]`
- `OncallPingsTable.state/trigger` 直接取 `OncallPing` 的同名字段，枚举由 CHECK 约束兜住
- `feishu_apps.app_secret` 与 `oncall_pings.last_error` 都是服务端-only 文本：secret 不进 DTO/导出
  明文，错误文本在写入前统一过 `redactText()`

SQLite 没有原生 boolean，因此使用 `SqliteBoolean = 0 | 1`。JSON 列在 SQLite 里是
TEXT，因此使用 `SqliteJsonText = string`。

---

## 6. Store 公共入口

`openSqliteStore(options?)` 是业务持久化入口：

```ts
export interface OpenSqliteStoreOptions {
  databasePath?: string;
  migrate?: boolean;
  migrationPlan?: readonly SqliteMigration[];
  now?: () => IsoDateTimeString;
  ids?: Partial<{
    source: () => string;
    destination: () => string;
    route: () => string;
    event: () => string;
    delivery: () => string;
    attempt: () => string;
    feishuApp: () => string;
    oncallPing: () => string;
  }>;
}

export async function openSqliteStore(options?: OpenSqliteStoreOptions): Promise<SqliteStore>;
```

默认会执行 migration。测试可以传入 `databasePath: ":memory:"`、固定 `now` 和确定性
ID 工厂。

`SqliteStore` 是 async repository set：

```ts
export interface SqliteStore extends SqliteStoreUnitOfWork {
  sqliteVersion(): Promise<string>;
  schemaVersion(): Promise<string | null>;
  close(): Promise<void>;
  transaction<T>(fn: (tx: SqliteStoreUnitOfWork) => Promise<T>): Promise<T>;
}
```

`sqliteVersion()` 通过当前 Kysely/`better-sqlite3` 连接执行 `sqlite_version()`，返回实际链接的
SQLite runtime 版本。server entry 在启动阶段打开 store 后读取该值，用于进程级系统信息日志。

`SqliteStoreUnitOfWork` 同时用于 store 本身和 transaction callback：

```ts
export interface SqliteStoreUnitOfWork {
  readonly sources: SourceRepository;
  readonly destinations: DestinationRepository;
  readonly routes: RouteRepository;
  readonly intake: IntakeRepository;
  readonly deliveries: DeliveryRepository;
  readonly feishuApps: FeishuAppRepository;
  readonly oncall: OncallRepository;
  readonly suppressions: SuppressionRepository;
  readonly history: HistoryRepository;
  readonly settings: SettingsRepository;
}
```

`createSqliteRepositories(context)` 按依赖顺序实例化 repository。`deliveries` 需要
sources/destinations/routes/intake/oncall；`oncall` 需要 destinations/intake（认领 ping 时把目标运行
时配置与事件一起带出）；`history` 需要 sources/intake/routes/deliveries。

加急队列的两个仓储是 ping 状态机的唯一持有者：

- `oncall.enqueueForDelivery()` 在一个事务里写 `oncall_pings` 与 `oncall_ping_dedupe_keys`，
  命中 `(fingerprint, destination_id, receiver)` 的窗口内已存在键时返回 `null`（被抑制的 ping 不落库）。
  过期键在同一次调用里先清理，因此不需要额外的清理 job。
- `claimNext()` / `reclaimStaleRunning()` / `markFired()` / `markFailed()` 与 delivery 侧一一对应，
  状态推进只作用于 ping 自己；`provider_ref_type / provider_ref_value` 记录被加急的那条消息，
  由 delivery 的 provider reference 复制而来。
- 级联：`oncall_pings.delivery_id` 随 delivery 级联删除，`oncall_ping_dedupe_keys.first_ping_id` 随
  ping 级联删除，因此删除 source/route/delivery 不会留下悬空加急记录。

---

## 7. Repository Context 与事务

`SqliteRepositoryContext` 持有 repository 共享依赖：

- `db: SqliteExecutor`
- `now()`
- `ids`

事务入口：

```ts
async runInTransaction<T>(fn: (context: SqliteRepositoryContext) => Promise<T>): Promise<T>
```

如果当前 `db` 已经是 Kysely transaction，`runInTransaction` 会复用当前 context；否则调用
`transaction(this.db, ...)` 开启 Kysely transaction。这样 repository 内部方法可以独立
使用，也可以被 `store.transaction()` 包裹复用。

`transaction.ts` 只是窄封装：

```ts
export function transaction<T>(
  db: SqliteKysely,
  fn: (tx: SqliteTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(fn);
}
```

---

## 8. 迁移方案

`migrateSqliteDatabase(db, options?)` 使用同一个 Kysely handle。默认情况下，runner 读取
`migrate/plan.ts` 导出的 `sqliteSchemaPlan`；这些 TypeScript schema module 会随 server
bundle 一起打包，不依赖部署环境里的源代码目录。测试或自定义工具可以通过 `options.plan`
注入一个显式 schema plan。

当前 schema plan 有三个 step（`migrate/plan.ts`）：

- `0001_initial_schema.ts`
- `0002_suppressions.ts`
- `0003_complete_legacy_schema.ts`

`0001_initial_schema.ts` 只负责编排，不直接堆大量 DDL：

- `schema.ts` 创建 Tocsin 业务表、settings 默认值和业务索引。
- `better-auth.schema.ts` 创建 Better Auth 所需表和索引。
- `better-auth.generated.sql` 是 Better Auth CLI 生成的 schema 快照，用于人工和测试对照，
  不是运行时执行的 SQL。

Runner 行为：

1. 读取 `migrate/plan.ts` 导出的 `sqliteSchemaPlan`。schema step 文件名形如
   `0001_initial_schema.ts`，metadata 必须满足：
   - `version` 是 4 位数字。
   - `name` 只包含小写字母、数字和空格。
   - `filename` 必须等于 `${version}_${name.replaceAll(" ", "_")}.ts`。
2. 拒绝重复 version、重复 name、空 schema plan 和 metadata 不一致的 step。
3. 用 Kysely schema builder 确保 `schema_migrations` 账本表存在。
4. 读取已应用版本。
5. 如果数据库账本里存在当前代码不认识的版本，拒绝继续运行。
6. 对未应用 step 逐个开启 Kysely transaction。
7. 调用 step 的 `up(tx)`。任意错误都会包装成带文件名的 `SqliteMigrationError`，并回滚当前
   step。
8. 写入 `schema_migrations`。

Schema builder 优先使用 Kysely schema/query builder，因为这能让 DDL、默认值和少量初始化数据
更 type friendly。需要 SQLite 特定表达式或约束时，可以使用 Kysely `sql` escape hatch；它仍然
通过 Kysely executor 执行，不暴露 raw driver。

`0001_initial_schema.ts` 仍代表全新库的完整 schema，但已经部署过的库必须靠 forward step 补齐。
新增 schema 变更时，不要再编辑已提交的 migration，而是新增 step 并在 `migrate/plan.ts` 注册；
需要操作历史列或中间状态时引入 migration-only schema 类型。

---

## 9. Better Auth Schema

Better Auth 的 `user` / `session` / `account` / `verification` 表与 Tocsin 表放在同一个
SQLite 数据库中，但不包装成 `SqliteStore` repository。认证读写由 Better Auth adapter
拥有。

Tocsin 的 SQLite 物理列使用 snake_case。Better Auth 的模型字段在 TypeScript/API 层仍是
`emailVerified`、`createdAt`、`userId` 这类 camelCase 名称，因此
`lib/auth-options.ts` 通过 `user.fields`、`session.fields`、`account.fields` 和
`verification.fields` 显式把它们映射到 `email_verified`、`created_at`、`user_id`
等列。`database.casing: "snake"` 同时传给 Kysely adapter；CLI 生成 schema 时以
`fields` 映射为准。

运行：

```bash
vp -C apps/console run auth:schema
```

会执行 Better Auth CLI：

```bash
vp exec auth@latest generate \
  --config src/lib/auth-cli.ts \
  --adapter kysely \
  --dialect sqlite \
  --output src/infra/sqlite/migrate/better-auth.generated.sql \
  --yes
```

生成文件只是当前 auth schema 的参考，和 `better-auth-schema.ts` 放在同一目录，方便对照
CLI 输出和手写 Kysely builder。全新库的运行时迁移仍由 `0001_initial_schema.ts` 调用
`better-auth.schema.ts` 创建表；已部署库由 `0002`/`0003` 补齐。涉及默认值、约束、owner
bootstrap 等 Tocsin 语义时，以 Tocsin builder 为准。

默认 runtime auth 配置在 `server/runtime/container.ts` 中通过：

```ts
database: {
  db,
  type: "sqlite",
  casing: "snake",
}
```

把同一个 `SqliteKysely` 传给 Better Auth。

---

## 10. Repository 组织

每个聚合目录使用同一结构：

- `*.interface.ts`：repository interface、输入 DTO、运行时配置/投影类型、必要 row 类型。
- `*.helpers.ts`：row 到领域对象的映射、JSON/boolean 解码、`requireX` 守卫。
- `*.repository.ts`：Kysely query builder 实现。

代表性接口：

```ts
export interface SourceRepository {
  list(): Promise<SourceSummary[]>;
  listEnabled(): Promise<SourceSummary[]>;
  get(id: string): Promise<SourceRuntimeConfig | null>;
  findByTokenHash(tokenHash: string): Promise<SourceRuntimeConfig | null>;
  create(input: CreateSourceInput): Promise<SourceSummary>;
  update(id: string, input: UpdateSourceInput): Promise<SourceSummary>;
  setEnabled(id: string, enabled: boolean): Promise<SourceSummary>;
}
```

`delivery` 是唯一会组合多个聚合的写模型：它依赖 source/destination/route/intake，用于
入队、去重、认领、成功/失败标记、手动重试和详情读取。

`history` 是跨聚合只读投影，不拥有表；它为 UI 提供事件列表、事件详情、投递列表。

---

## 11. 校验与编解码边界

判据：只有跨越序列化/不可信边界的数据才做运行时校验。

| 数据 | 是否运行时校验 | 做法 |
| --- | --- | --- |
| JSON 列读出 | 是 | `decodeJsonObject` / `decodeSchemaJson` |
| 写入前领域对象 | 是 | 对应 core schema `.parse()` |
| enum / union 列 | 是 | core enum schema 或领域 schema |
| SQLite boolean | 是 | `fromSqliteBoolean` |
| repository 输入 DTO | 否 | 内部 TypeScript interface |
| 只读投影 | 否 | 由已校验片段在进程内拼装 |

`codecs.ts` 仍保留 `rowAs` / `rowsAs` / `rowOrUndefined`，但 Kysely repository 不再依赖
raw driver 的 unknown row 返回；这些 helper 只作为低层兼容工具保留。

---

## 12. 错误模型

- 取不到记录：`RecordNotFoundError`。
- 数据完整性违例：`SqliteDataIntegrityError`。
- JSON / schema 解析失败：保留 Zod 自身错误。

`errors.ts` 不加 `server-only`，因为错误类本身是纯 TypeScript 类型和 `Error` 子类。

---

## 13. 测试守护

重点测试：

- `connection.test.ts`：验证文件数据库目录创建、Kysely handle 可执行查询。
- `migrate.test.ts`：验证 schema plan（0001–0003）、账本、严格文件名、Better Auth 生成快照、
  执行失败回滚、重复/未知 schema version 防护。
- `transaction.test.ts`：验证 Kysely transaction rollback，以及嵌套 repository transaction
  复用当前 transaction context。
- `store.test.ts`：覆盖 ID 注入、去重入队、claim、retry、history/detail 等 store 行为。
- `intake.service.test.ts` 和 webhook route 测试：覆盖 parser 失败审计、脱敏、delivery
  入队和 HTTP 响应。

修改 SQLite 层后至少运行：

```bash
vp -C apps/console run typecheck
vp -C apps/console test run
```

触碰 import boundary 或 TanStack Start server/runtime 时，再运行：

```bash
vp -C apps/console build
```

---

## 14. 扩展规则

新增表或改 schema：

1. 新增 forward step（例如 `0004_...ts`）并在 `migrate/plan.ts` 注册；不要编辑已提交的
   `0001`–`0003`。
2. 更新 `schema.ts` 的 Kysely table 类型。
3. 更新对应 repository helper / implementation。
4. 补充 schema plan 和 repository 测试。
5. 如果 Better Auth 配置或 plugin 改变，先运行 `auth:schema` 生成参考 schema，再把差异转写
   到 `better-auth-schema.ts`。
6. 发布后需要兼容已有部署时，新增 forward-only step 并在 `migrate/plan.ts` 显式注册，不再
   修改旧 step。

新增聚合：

1. 新建 `repositories/<aggregate>/` 并拆成 `interface/helpers/repository`。
2. 在 `SqliteStoreUnitOfWork` 和 `createSqliteRepositories()` 注册。
3. 需要事务组合时通过 `SqliteRepositoryContext.runInTransaction()`，不要引入 module-level
   singleton。

Related:

- [[Tocsin Index]]
- [[Tocsin Application Container]]
- [[Tocsin TanStack Start Import Boundaries]]
