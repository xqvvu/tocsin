# Settings 数据库存储健康面板

- 状态：已实现（第 71 轮，需求切片）
- 相关代码：`apps/console/src/features/configuration/ui/settings-storage-panel.tsx`、
  `apps/console/src/server/runtime/storage-health.service.ts`、
  `apps/console/src/infra/sqlite/store.ts`
- 相关文档：`docs/prd/raw-payload-pruned-state.md`、`docs/prd/delivery-backlog-summary.md`

## 问题

Tocsin 是自托管、SQLite-first 的单进程服务，数据库文件就是全部历史。当前控制台没有
任何存储观测面：

- Settings 的「运行时与生效参数」面板只列进程、日志和出站限制
  （`settings-runtime-panel.tsx:15-47`），没有库体积、行数或历史跨度；
- `/api/ready` 只返回三个布尔检查（`routes/api/ready.ts:17-31`），不回答「库有多大」；
- 全仓没有 `page_count` / `fileSize` / `integrity_check` 的运行时消费。

值班 SRE 排查「磁盘为什么涨」「历史保留是否生效」「库是不是该清理」时，只能登录宿主机
看文件系统，无法在控制台内判断增长来自事件、投递还是加急呼叫。

## 用户故事

作为自托管实例的值班 SRE，我在 Settings 里能看到数据库体积、可回收空间、各主要表的
行数以及最老/最新事件时间，从而判断增长来源和历史跨度，而不必登录宿主机。

## 范围

- 新增只读 oRPC 过程 `settings.getStorageHealth`，输出固定白名单 DTO：
  - `databaseBytes`：`page_count × page_size`；
  - `freeBytes`：`freelist_count × page_size`（可回收空间）；
  - `tableCounts`：`events`、`deliveries`、`delivery_attempts`、`oncall_pings` 的总行数；
  - `oldestEventAt` / `newestEventAt`：`events.received_at` 的最小/最大值，空库为 `null`。
- 存储查询放在 `infra/sqlite`（`SqliteStore.storageHealth()`），使用 Kysely 的
  `sql` 模板；service 在 `server/runtime/storage-health.service.ts` 中逐字段映射为 DTO。
- Settings「界面」页签在运行时面板之后新增「数据库存储」面板，沿用现有事实网格
  （`dl` + `StorageFact`）的密度与语义色。
- 体积使用二进制单位（B/KiB/MiB/GiB）；整数值不带小数，小于 100 的非整数保留一位小数。
- 行数按当前控制台语言做千分位格式化；时间使用控制台已配置的时区与语言。
- 空库时最老/最新事件显示「暂无事件」。

## 非目标

- **不做 `integrity_check` / `quick_check`**：两者都会扫描整个文件，在单进程运行时里
  会阻塞 worker 和请求；需要时应作为显式的、可限时的独立操作，而不是随设置页加载执行。
- 不暴露数据库文件路径：路径属于宿主机部署信息，对排障增长来源没有增量价值。
- 不提供清理、压缩（`VACUUM`）或保留策略修改入口；保留策略仍由现有设置项控制，
  `VACUUM` 需要独占锁，不适合放进请求路径。
- 不新增表、列或迁移；不改变事件/投递/加急的任何写入语义。
- 不把行数做成实时轮询指标；面板随设置页查询缓存刷新。

## 验收标准

- `settings.getStorageHealth` 需要 dashboard 认证；未登录返回既有 auth 错误。
- 新库返回 `databaseBytes > 0`、`freeBytes >= 0`、四张表计数为 0、事件时间均为 `null`。
- 写入两个事件后，计数与最老/最新事件时间与实际一致。
- DTO 不包含数据库路径、pragma 原始输出、payload、token 或任何 secret 字段。
- Settings 页在空库与非空库下都能渲染面板；窄视口下网格降为单列，不横向溢出。
- `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- persistence：`infra/sqlite/store.ts` 增加 `storageHealth()`，与既有
  `sqliteVersion()` / `schemaVersion()` 同层；`StorageHealthSnapshot` 定义在
  `infra/sqlite/storage-health.ts`，不依赖 `@tocsin/api`。
- service：`server/runtime/storage-health.service.ts` 接收
  `Pick<SqliteStore, "storageHealth">`，可用 fake store 单测；不抛 transport error。
- 契约：`packages/api/src/schemas/settings.ts` 与 `contract/settings.ts` 新增输出 schema
  与过程；console router 用 `withDashboardService` 注入依赖。
- 前端：查询选项在 `features/configuration/api/configuration.queries.ts`，面板在
  `features/configuration/ui/`，不改 route loader；无新的全局状态或依赖。
