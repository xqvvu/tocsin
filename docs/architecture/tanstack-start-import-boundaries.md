# TanStack Start 导入边界规范

本文档记录 Tocsin console 当前的 client/server 导入边界。历史上这里曾是一份 `application/` 目录拆分设计稿；当前代码已经收敛为 `server/`（含 `server/orpc` implementer）+ `infra/sqlite/repositories/` + `@tocsin/api` / `@tocsin/core` 共享契约，旧设计稿不再作为执行依据。oRPC 契约、implementer 与 handler 的完整形状见 `docs/architecture/orpc-api-layer.md`。

适用范围：`apps/console/src`。产品范围以 `docs/prd/self-hosted-alert-hub-mvp.md` 为准；后端依赖组装以 `docs/architecture/application-container.md` 为准；朴素分层决策见 `docs/adr/0004-console-plain-layered-structure.md`。

---

## 1. 核心规则

1. **默认不加 import-protection marker。** 普通 `.ts` / `.tsx` 文件默认保持 environment-neutral。
2. **只在模块自身直接触碰环境专属 API 时加 marker。** Server 侧包括 `node:*`、SQLite driver、filesystem、`process.env` / secret config、Better Auth server runtime；client 侧包括 `window`、`document`、`navigator`、`localStorage`、DOM。
3. **不因为目录名或转手 import 加 marker。** 一个模块只是概念上属于服务端，或只是 import 了另一个 server module，不自动加 `server-only`。TanStack Start build 会在 marked module 或 `node:*` 进入 client-safe import chain 时失败。
4. **共享契约放在 `@tocsin/api`、`@tocsin/core` 或 feature `model/*`。** oRPC contract 在 `@tocsin/api`；command schema、DTO、查询过滤器、表单值、展示模型和纯函数在 `@tocsin/core` 或 feature。两者都必须保持 env-neutral。
5. **oRPC 是 RPC boundary。** 浏览器只能导入 `#/lib/orpc`（isomorphic client）；`#/server/orpc/*` 是 server-only implementer，client-safe code 不得静态 import。

---

## 2. 当前目录分类

| 文件内容                                                         | 位置                                                            | import protection                                                                         |
| ---------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 共享 schema、command type、DTO、route rule、operation projection | `packages/core/src/<module>/`                                   | 不加；必须 env-neutral                                                                    |
| oRPC contract、error map、procedure schema、client 类型           | `packages/api/src/{contract,errors,schemas,client.ts}`          | 不加；必须 env-neutral                                                                    |
| feature query/mutation/form/search/view model                    | `apps/console/src/features/*/{api,model}`                       | 不加；不得导入 `#/server/*` implementation 或 `#/infra/*`                                 |
| route file、loader、layout、薄页面入口                           | `apps/console/src/routes/*`                                     | 不加；loader 通过 feature queryOptions 取数                                               |
| oRPC isomorphic client                                            | `apps/console/src/lib/orpc.ts`                                  | 不加；用 `createIsomorphicFn` 分叉 SSR 与浏览器路径                                      |
| oRPC implementer、root router、feature router、procedure middleware | `apps/console/src/server/orpc/**`                             | 当前不加；其 import 链已到达 `node:crypto`、container 等 server-only 模块，客户端不得 import |
| oRPC HTTP handler / API route                                     | `apps/console/src/routes/api/**`                                | 不加；TanStack Start server route，import 链不得把 server-only 模块带入 client bundle      |
| 全局 request middleware                                           | `apps/console/src/middlewares/*.middleware.ts`                  | 通常不加；server callback 内可调用 runtime                                                |
| Start 全局配置                                                   | `apps/console/src/start.ts`                                     | 不加；保持 isomorphic，只组合 request middleware 与 CSRF middleware                       |
| server entry                                                     | `apps/console/src/server.ts`                                    | server entry；可初始化 server-only Logging Runtime                                        |
| per-capability service                                           | `apps/console/src/server/<capability>/*.service.ts`             | 仅当自身直接触碰 env-specific API 时才加                                                  |
| service option/result 类型                                       | `apps/console/src/server/<capability>/*.service.types.ts`       | 不加；必须保持 env-neutral 或只 import type                                               |
| application container                                            | `apps/console/src/server/runtime/container.ts`                  | 加；直接 import Better Auth、env、SQLite                                                  |
| request context                                                  | `apps/console/src/server/runtime/request-context.ts`            | 当前不加；直接使用 TanStack server headers 和 container accessor，只能从 server path 调用 |
| dashboard session/auth 错误类型                                  | `apps/console/src/server/runtime/dashboard-session.ts`          | 不加；纯后端类型/错误                                                                     |
| LogTape 配置                                                     | `apps/console/src/server/runtime/logging.ts`                    | 加；直接使用 `node:async_hooks`、env 和进程级 sink 配置                                   |
| 日志安全投影                                                     | `apps/console/src/server/runtime/log-safety.ts`                 | 不加；env-neutral，可由 request middleware 的 server callback 使用                        |
| SQLite connection/migration/context                              | `apps/console/src/infra/sqlite/{connection,migrate,context}.ts` | 直接触碰 driver/Node API 的模块加                                                         |
| SQLite Kysely schema types                                       | `apps/console/src/infra/sqlite/schema.ts`                       | 不加；纯类型                                                                              |
| SQLite repository/store/codecs/errors/types                      | `apps/console/src/infra/sqlite/**`                              | 默认不加；但前端仍不得导入 `#/infra/*`                                                    |
| Better Auth server config / owner bootstrap                      | `apps/console/src/lib/*auth*.ts`                                | 直接触碰 Better Auth/env/secret/server plugin 时加                                        |
| browser-only implementation                                      | `*.client.ts(x)` 或 `client-only`                               | 直接使用浏览器 API 时加                                                                   |

判断标准：shared by default，server/client only by direct dependency。如果只是因为同文件混了共享 schema/type 和 server implementation 才需要 marker，应拆文件，把共享部分移到 `@tocsin/core` 或 feature `model/*`。

`start.ts` 会进入 TanStack Start 的全局配置类型链，不能静态 import `logging.ts` 或
`node:async_hooks`。LogTape 的进程级 `configure()` 只能从 `server.ts` 调用；request middleware 使用
LogTape 的 environment-neutral logger/context 接口，运行时由 server entry 提供
`AsyncLocalStorage`。

---

## 3. oRPC 导入规则

浏览器进入服务端能力的默认门面是 `#/lib/orpc`。它用 `createIsomorphicFn` 分叉两条路径：

- server：`createRouterClient(router, { context: async () => ({ reqHeaders: getRequestHeaders() }) })`。
- client：`new RPCLink({ url: "/api" })` + `createORPCClient`。

因此 client-safe code 只 import `#/lib/orpc`，由 TanStack Start 的 build 剥掉 server 分支；`#/server/orpc/**` 属于 server-only implementer，静态 imports 规则是：

- `server/orpc/os.ts` 只组装 `implement(contract)` 与全局 procedure middleware，不接触 store。
- 每个 feature router 只做 input 适配、取 service、调业务方法；service 通过 `context.dashboardRequest.container` 或 handler 内的窄 runtime accessor 获取。
- 不在 module 初始化阶段调用 runtime/container、打开数据库、读取 secret 或创建 service。
- 不把 `#/server/orpc/*`、`#/infra/*`、Better Auth server runtime 或 `node:*` 带进任何 client-safe import chain。

Public procedure（`health`、`i18n`、`session.getDashboardSession`）不挂 `requireDashboard()`。`i18n.getRequestLocale` 在 handler 内直接 import `getApplicationContainer()`；`session.getDashboardSession` 捕获 auth error 后返回 nullable state。

Private dashboard procedures 一律 `.use(requireDashboard())`，并在 contract 上声明 `dashboardAuth.error`：

```ts
export const sourcesRouter = os.sources.router({
  create: os.sources.create.use(requireDashboard()).handler(async ({ context, input }) =>
    (await context.dashboardRequest!.container.createSourceService()).createSource(input),
  ),
});
```

挂在 router 级的 `.use(...)` 会把 UNAUTHORIZED / FORBIDDEN error map 强加到所有 procedure 上，包括 public 的 auth 与 i18n，因此 dashboard middleware 只按 procedure 挂载。

---

## 4. Route / Feature 导入规则

Route files 只拥有 URL concern：

- route path/layout。
- `validateSearch` / `loaderDeps`。
- `loader` 预取 feature `queryOptions`。
- `beforeLoad` 的 UX guard。
- 渲染 feature page 或 shell。

Route、feature UI、feature model、feature api 不得直接导入：

- `#/infra/*`。
- `#/server/runtime/container.ts`。
- `#/server/*/*.service.ts`。
- `#/server/orpc/*`（implementer 与 handler）。
- SQLite repository/store/driver。
- env secret、Better Auth server runtime、filesystem。

Feature 的 `api/*.queries.ts` / `api/*.mutations.ts` 导入 `#/lib/orpc`，并封装 query key、queryOptions、mutation 和 invalidation。UI 组件优先导入 feature api，不散落 procedure 调用。

---

## 5. 共享契约

跨 client/server 的 oRPC contract、error map、procedure input/output schema 与 client 类型放在 `@tocsin/api`：

- `packages/api/src/contract/`：按 namespace 拆分的 contract（`session`、`destinations`、`health`、`i18n`、`integrations`、`operations`、`portability`、`routes`、`settings`、`sources`、`suppressions`）。
- `packages/api/src/errors/`：共享 `dashboardAuth` error map。
- `packages/api/src/schemas/`：procedure input/output schema。
- `packages/api/src/client.ts`：`RPCClient = RouterContractClient<typeof contract>`，由 `server/orpc/router.ts` 的 `satisfies` 检查实现是否漂移。

command schema、input validator、DTO 和投影类型放在 `@tocsin/core`：

- `packages/core/src/configuration/configuration-commands.ts`：Source/Destination/Route/Settings、TOML/JSON import/export command schema。
- `packages/core/src/operations/operations.ts`：Events/Deliveries list/detail DTO、worker health/run result projection。
- 既有 Source、Destination、Route、Delivery、Event schema 分别放在 `packages/core/src/<module>/`。

`@tocsin/api` 与 `@tocsin/core` 必须保持 env-neutral，不得导入：

- `node:*`。
- `#/server/*` 或 `#/infra/*`。
- TanStack Start import-protected modules。
- `.server` / `.client` modules。

仅后端消费的类型不需要放进 core。例如 dashboard session 类型和 dashboard auth 错误在 `apps/console/src/server/runtime/dashboard-session.ts`。

---

## 6. Dashboard Auth 与 Webhook Auth

Dashboard auth 和 webhook auth 是两条边界：

- Dashboard procedures 通过 `requireDashboard()` middleware 使用 Better Auth session，并检查 owner/admin。
- Public auth probes 可以直接调用 request context 并捕获认证错误。
- Webhook API routes 使用 Source token 或 Tocsin 侧额外共享密钥；它们不读取 browser dashboard session。

`server/runtime/dashboard-auth.ts` 已删除。session 类型和错误类在 `dashboard-session.ts`，鉴权逻辑在 `request-context.ts`。

---

## 7. 验收标准

变更 oRPC contract、procedure、route loader、feature query、service 或 repository 后，至少确认：

- `@tocsin/api`、`@tocsin/core` 和 feature `model/*` 没有导入 `#/server/*`、`#/infra/*`、`node:*`、`.server` / `.client` 模块。
- `packages/api` 的 contract 与 `server/orpc` 的实现一致（root router 满足 `RPCClient` 类型）；新增或改名的 procedure 同步更新 contract、feature router 和 feature api 封装。
- route loader 没有直接打开 SQLite、访问 container 或读取 secret。
- dashboard procedure 有服务端 auth check（contract 声明 `dashboardAuth.error` + 实现挂 `requireDashboard()`）。
- webhook API route 不依赖 dashboard session。
- procedure 返回 safe DTO，不返回 row、token hash、destination secret、raw sensitive config 或 database handle。
- 相关 package-scoped `fmt:check`、`lint`、`test` 通过；触碰 import boundary 时跑 `vp -C apps/console build`。

---

## 参考

- TanStack Start Import Protection: <https://tanstack.com/start/latest/docs/framework/react/guide/import-protection>
- TanStack Start Code Execution Patterns: <https://tanstack.com/start/latest/docs/framework/react/guide/code-execution-patterns>
- oRPC 契约与 implementer: `docs/architecture/orpc-api-layer.md`
- oRPC Documentation: <https://orpc.unnoq.com/docs/getting-started>
