# 就绪探针的启动失败原因码

## 问题

Tocsin 是单进程、SQLite-first 的自托管服务，升级与回滚都靠换镜像。回滚到旧镜像时，数据库台账里
可能已有旧构建不认识的 migration（例如 `0004_oncall_dispatch_started_at`），此时 server entry 顶层
`await getApplicationContainer().getSqliteStore()` 会抛 `SqliteMigrationError`，模块加载失败：

- 所有请求（包括 `/api/ready`）都得到 `{"statusCode":500,"message":"Server Error"}`；
- 真实原因只出现在容器日志里；
- 探针与 runbook 无法区分「迁移不兼容」「数据库不可写」「worker 启动失败」。

2026-10-26 的升级演练记录了这一现象（`docs/release/backup-restore-upgrade.md` 第 6、8 节）。
代码证据：`apps/console/src/server.ts`（顶层 `await bootstrap()`）、
`apps/console/src/routes/api/ready.ts`（运行期 checks 只有 `status`/`checks`）、
`apps/console/src/server/runtime/health.types.ts`（`ReadyResponse` 无失败原因字段）。

## 用户故事

作为值班 SRE，我用 `/api/ready` 做容器健康检查和升级验证。容器不健康时，我希望响应体里直接给出
稳定的原因码，这样我能立刻判断是回滚版本不兼容、数据库路径/权限问题，还是后台 worker 起不来，
而不必先翻日志。

## 范围

- `/api/ready` 的非就绪响应新增可选 `code` 与固定的 `message`。
- `code` 取值：
  - `migration_unknown`：数据库包含本构建不认识的已应用 migration；
  - `migration_failed`：其它迁移失败，或无法读取 schema 版本；
  - `store_unavailable`：SQLite 无法打开/读取；
  - `worker_unavailable`：数据库正常但后台 worker runner 启动失败。
- 启动期存储失败时，保留原始错误；应用请求仍按原错误失败，只有 `/api/ready` 返回带 `code` 的 503。
- 运行期检查失败时，由 `checks` 推导等价的 `code`。
- 为错误分类与就绪检查补齐单元测试。

## 非目标

- 不返回堆栈、数据库路径、SQL、迁移版本列表或任何 secret；`message` 是固定安全文案。
- 不改变健康启动时的 200 响应形状。
- 不改变 `BETTER_AUTH_SECRET` 缺失或占位时的既有刻意行为（所有请求失败）。
- 不改变启动顺序，不新增迁移，不引入自动重试或进程退出。
- 不改 oRPC 契约、不改客户端 DTO、不改投递/路由/auth 语义。

## 验收标准

1. 健康启动：`/api/ready` 返回 200 `{status:"ok",checks:{sqlite:"ok",migrations:"ok",worker:"ok"}}`，
   且没有 `code`/`message`。
2. 未知迁移：返回 503，`code="migration_unknown"`，`message` 为固定文案，
   `checks={"sqlite":"ok","migrations":"error","worker":"skipped"}`；响应体不含迁移版本号或错误原文。
3. 数据库无法打开：返回 503，`code="store_unavailable"`，`checks.sqlite="error"`。
4. 运行期 schema 版本读取失败或为空：返回 503，`code="migration_failed"`。
5. worker runner 启动失败：返回 503，`code="worker_unavailable"`，`checks.worker="error"`。
6. 启动期存储失败时，非 `/api/ready` 请求仍抛出原始错误（行为与改动前一致）。
7. `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- 只触及 API 路由与 server runtime，不进入 `@tocsin/core` / `@tocsin/api` 契约，也不进入客户端状态。
- 分类逻辑是 `server/runtime/startup-failure.ts` 中的纯函数；就绪检查是
  `server/runtime/readiness.ts` 中的纯异步函数，依赖以参数注入，便于用假 store 测试。
- 新增 `SqliteMigrationCompatibilityError` 子类，仅由迁移 runner 的未知台账分支抛出，避免用
  错误文本做分类。
- 失败原因码只出现在探针响应中，不写入数据库、不进入请求上下文。
