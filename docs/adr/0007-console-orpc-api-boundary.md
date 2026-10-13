# Console 采用 oRPC 作为 client/server RPC 边界

状态：接受。本 ADR 在 `0004-console-plain-layered-structure.md` 之后，**取代**其中"用
`*.functions.ts` 作为 controller 入口"的边界实现方式；0004 的其余结论（朴素分层、共享契约
env-neutral、`server/` 按能力分目录、dynamic import 只作边界适配、跨边界 DTO 单一定义）仍然有效。

## 背景

0004 之后，console 的唯一 client/server 边界是 TanStack Start `createServerFn`：每个
`*.functions.ts` 各自声明 `.validator(schema)`、挂 `requireDashboardContextMiddleware`、
在 handler 内取 service。这个形状能用，但边界信息是**分散**的：

- 契约同时存在于 `@tocsin/core` 的 command schema、server function 的 `.validator()` 和
  feature api 的调用点三处，改名或改形状不会有编译期守卫。
- 每个 server function 手写 middleware 与 handler，公共 RPC 语义（错误映射、请求 id、
  响应头、批量请求、OpenAPI）没有统一位置。
- 对外 HTTP API 与浏览器调用是两套形状，无法从同一份定义生成 API reference。
- feature 侧的 query/mutation 需要额外 `useServerFn` 包装，query key、mutation 与
  invalidation 的组合没有框架级支持。

## 决定

把 client/server 边界换成 **oRPC（contract-first）**，同时保持 TanStack Start 全栈单体，
不拆分独立后端服务。

1. **新增 `packages/api` 承载公开契约。** `contract/` 按 namespace 拆分 oRPC contract
   （`auth`、`destinations`、`health`、`i18n`、`operations`、`portability`、
   `routes`、`settings`、`sources`），`errors/` 放共享 `dashboardAuth` error map，
   `schemas/` 放 procedure input/output schema，`client.ts` 导出
   `RPCClient = RouterContractClient<typeof contract>`。该包保持 env-neutral，不 import
   `node:*`、`#/server/*`、`#/infra/*` 或带 import protection 的模块。

2. **`apps/console/src/server/orpc/` 承载 server-only implementer。**
   `os.ts` = `implement(contract).use(requestId())`；`features/<capability>/router.ts`
   每个 procedure 一行，只做 input 适配、取 service、调业务方法；`middlewares/` 放
   `request-id` 与 `require-dashboard`；`handler.ts` 同时构造 `RPCHandler` 与
   `OpenAPIHandler`；`router.ts` 组合 root router。删除 `server/functions/*.functions.ts`
   与 `middlewares/dashboard-context.middleware.ts`。

3. **浏览器只 import `#/lib/orpc.ts`。** 该文件用 `createIsomorphicFn` 分叉：server 侧
   `createRouterClient(router, { context: async () => ({ reqHeaders: getRequestHeaders() }) })`，
   浏览器侧 `RPCLink({ url: "/api" })` + `createORPCClient`。导出 `rpcClient` 与
   `createTanstackQueryUtils(rpcClient)` 得到的 `orpc`，feature 用
   `orpc.<ns>.<proc>.queryOptions(...)` / `.call` 封装 query 与 mutation。

4. **Authentication 按 procedure 挂载。** private procedure 在 contract 上声明
   `dashboardAuth.error`（UNAUTHORIZED / FORBIDDEN），实现处 `.use(requireDashboard())`
   或 `.use(withDashboardService(...))`。不把 dashboard middleware 挂在 router 级——那会把
   错误映射强加到 public 的 `health`、`i18n` 和 `session.getDashboardSession` 上。
   `requireDashboardContext()` 从 `context.reqHeaders` 解析 session，因此 SSR 进程内调用与
   浏览器 RPC 调用走同一条鉴权路径。guard 的 output context 显式类型化，使
   `context.dashboardRequest` / `context.service` 在挂过 guard 的 handler 内非可选，漏挂
   guard 成为类型错误而不是运行时 panic。

   `withDashboardService(createService)` 由该 ADR 之后的实现补充：它在 guard 之上注入
   `context.service`，把“解析服务”从每个 handler 上移到 middleware，handler 只剩一次调用。

5. **两个 handler、两个协议，不混用。** 浏览器走 RPC protocol（`POST /api/<procedure path>`），
   外部调用与生成的 reference 走 OpenAPI surface（`/api/openapi`、`/api/openapi/spec.json`、
   `/api/openapi/docs`）。两个 handler 共用同一个 router，因此文档与实际服务形状一致；
   但 `RPCLink` 的 `{"json": ...}` 信封只能由 RPC codec 解码，两套协议不可互换。
   procedure 不声明 HTTP method，OpenAPI generator 与 RPCLink 都采用默认 POST；两面有 input
   的 procedure 都使用 JSON body。

6. **Webhook intake 与 Better Auth 保持普通 API route。** 上游监控系统的 intake 用 Source
   token 或额外共享密钥认证，不进入 oRPC surface，也不读取浏览器 session。

## 不变的部分

- 部署形态不变：仍然是单进程、SQLite-first、一个 console 应用；这**不是**前后端分离，
  oRPC router 与 UI 打包在同一个 TanStack Start 应用里。
- 朴素分层不变：entrypoint（procedure / API route）→ service → repository。
- application container、request context、`require-dashboard` 的鉴权语义、service
  构造函数注入、DTO 安全规则（不返回 token hash、destination secret、raw sensitive config）
  全部保持。
- TanStack Start import protection 仍是打包边界的守护：`#/server/orpc/*` 不得进入
  client-safe import chain，`#/lib/orpc.ts` 的 server 分支由框架剥离。
- 前端仍然使用 TanStack Router / Query / Form / Table / shadcn 同一套栈。

## 迁移

行为不变的小步迁移，每步通过 console `lint` / `test` / `build`：

1. 建 `packages/api` 的 contract / errors / schemas / client 类型，`server/orpc` 的
   implementer、feature router、middleware、handler 与 `/api`、`/api/openapi` route。
2. 换 `#/lib/orpc.ts`，把九个 feature/lib 的 `*.queries.ts` / `*.mutations.ts` 改为
   `orpc.*` 封装，保留既有 query key factory。
3. 删除 `server/functions/*.functions.ts` 与 `dashboard-context.middleware.ts`，更新调用点。
4. 用 `server/orpc/server-orpc-auth.test.ts` 守护 procedure 清单与 `requireDashboard()`
   挂载；用 production build 验证 server-only 模块没有进入 client bundle。
5. 重写 `AGENTS.md` 的边界章节与相关架构文档，并记录本 ADR。

## 不采用的替代方案

- **继续用 `createServerFn` 并在其上叠加 oRPC**：两套 RPC 边界并存会让"契约真相在哪"分裂，
  也保留了两份调用约定与两套错误形状。
- **tRPC**：可以解决类型安全，但没有内建 contract-first 的 OpenAPI 生成，缺少
  `createTanstackQueryUtils` 这类直接产出 query/mutation options 的工具，也需要自己补
  procedure middleware 之外的契约层。
- **把后端拆成独立服务（前后端分离）**：与 Tocsin "单进程、一个镜像、一个数据卷"的自托管
  约束冲突，也超出本次重构范围。oRPC 的 handler 只是同一应用内的另一条 HTTP 入口。
- **直接暴露 OpenAPI surface 给浏览器用**：浏览器需要 RPC 信封来支持批量请求、响应头
  透传和 TanStack Query utils；OpenAPI surface 面向外部调用方与文档。

## 补充：领域错误在边界翻译

本 ADR 之后发现的一个语义缺口：service 抛出的领域错误到达浏览器时被折叠成
`INTERNAL_SERVER_ERROR` / "Internal Server Error"，原始 message 被丢弃。删除一个已不存在的
Destination、导入格式错误的 TOML，在 operator 看来都是“服务器故障”。

修复方式保持在既有分层内：

- service 继续用领域错误类表达语义（repository 的 `RecordNotFoundError`、service 的
  `DomainValidationError`），不引入对 oRPC 的依赖。
- 根 implementer 挂一个 `translateErrors` middleware，调用
  `server/orpc/errors.ts#toContractError()` 把领域错误映射成 `NOT_FOUND` / `BAD_REQUEST` /
  `CONFLICT`；该 middleware 不声明 error map，因此不会污染 public procedure 的契约。
- 契约层新增 `packages/api/src/errors/resources.ts`，供会抛出这些错误的 procedure 显式声明 code。

这仍然符合“朴素分层”：entrypoint 负责传输语义，service 负责业务语义，翻译发生在两者之间的
边界 middleware。

## 参考

- `docs/architecture/orpc-api-layer.md`
- `docs/architecture/tanstack-start-import-boundaries.md`
- `docs/adr/0004-console-plain-layered-structure.md`
