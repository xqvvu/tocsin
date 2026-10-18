# oRPC API 层（contract / router / handler）

本文档定义 Tocsin 在当前 TanStack Start 单体应用中的客户端 ↔ 服务端调用方式。

结论先说：**Tocsin 不做前后端分离**。console 仍然是 TanStack Start 全栈应用，路由、SSR、
server entry、SQLite、worker 都在同一个进程、同一个部署单元里。变化只在“浏览器如何调用
服务端能力”这一层：原来的 TanStack Start server function（`createServerFn`）换成 **oRPC
contract + router**，让契约集中在一处、类型端到端推导，并顺带得到一个可生成的 OpenAPI 面。

适用范围：`packages/api`、`apps/console/src/{lib,server/orpc,routes/api}`。产品范围以
`docs/prd/self-hosted-alert-hub-mvp.md` 为准；后端分层与服务/repository 职责见
`docs/architecture/application-container.md`；导入边界见
`docs/architecture/tanstack-start-import-boundaries.md`。

---

## 1. 为什么是 oRPC

server function 能跑通全栈调用，但契约是“按文件散落”的：每个 `*.functions.ts` 自己声明
input validator 和返回类型，客户端靠 `useServerFn` 绑定，跨文件复用 DTO 只能靠约定。

oRPC 把契约变成一等公民：

- **一份 contract 定义整个 API 形状**（namespace、input、output、error code），放在
  `packages/api`，client 与 server 都从同一处推导类型。
- **implementer 必须实现 contract 的全部分支**，router 少写或多写一个 procedure 会在类型层
  报错，契约不会悄悄漂移。
- **同一套 router 可以挂不同 protocol**：浏览器走 RPC protocol，外部调用方走 OpenAPI，
  不需要维护两份定义。
- **TanStack Query 集成是官方的**：`orpc.<ns>.<proc>.queryOptions()` / `mutationOptions()`
  直接产出可用的 query options，feature 层不用自己包一层。

代价是要维护一个 workspace 包和一层 protocol 知识。以 Tocsin 当前的 11 个业务 namespace
和长期维护目标看，这个代价是划算的。

## 2. 分层与数据流

```txt
packages/api                     契约层（env-neutral，无 server-only 代码）
  src/contract/*                 按能力一个文件：oc 定义 input/output/error
  src/schemas/*                  该能力独有的 output DTO
  src/errors/*                   跨能力共享的 error map（dashboardAuth、notFound）
  src/client.ts                  RPCClient 类型（RouterContractClient）

apps/console/src/server/orpc     实现层（server-only）
  os.ts                          implement(contract).use(procedureLogging()).use(translateErrors).use(requestId())，全 console 共用
  router.ts                      根 router：os.router({ session, sources, ... })
  features/<capability>/router.ts  每个 procedure 一行：取 service、调用、返回 DTO
  middlewares/*.ts                requestId、requireDashboard
  handler.ts                     RPCHandler（/api）与 OpenAPIHandler（/api/openapi）

apps/console/src/lib/orpc.ts     同构客户端入口（isomorphic）
  server: createRouterClient(router)  直接进程内调用，不经过 HTTP
  client: RPCLink('/api') + createORPCClient
  export const orpc = createTanstackQueryUtils(rpcClient)

apps/console/src/features/*/api  feature 边界（client-safe）
  *.queries.ts / *.mutations.ts  只依赖 #/lib/orpc，不 import #/server/*
```

一次 dashboard 请求的完整路径：

```txt
route loader / 组件
  -> feature api（orpc.sources.list.queryOptions(...)）
     -> SSR 阶段：#/lib/orpc 的 server 分支 createRouterClient，进程内直调 router
     -> 浏览器阶段：RPCLink POST /api/sources/list
        -> routes/api/$.ts（server handler）
           -> rpcHandler.handle(request, { prefix: "/api" })
              -> middleware 链：procedureLogging -> translateErrors -> requestId -> withDashboardService
                 -> procedure handler
                    -> context.service.listSources()
                       -> SourceService -> SQLite repository
```

关键点：**service、repository、worker 的组织方式没有变**。oRPC 只替换了“入口层”的实现方式，
`server/<capability>/*.service.ts` 与 `infra/sqlite/repositories/<module>/` 完全沿用既有约定。

handler 与 service 的关系被压缩成三件事：**guard（是否放行）+ service 解析（用哪个 service）
+ 调用（调哪个方法）**。前两件由 middleware 承担，第三件是 handler 里唯一的一行；见 4.2 与 4.3。

## 3. 契约层（`packages/api`）

契约包只放 env-neutral 的内容：Zod schema、`oc` 契约定义、error map、以及供客户端使用的
类型。它不 import `node:*`、SQLite、`better-auth`、console 的 `#/server/*`，因此可以被浏览器
bundle 安全引用。

一个能力的契约长这样：

```ts
// packages/api/src/contract/sources.ts
export const sources = {
  list: oc.errors(dashboardAuth.error).output(SourceListOutputSchema),

  create: oc
    .input(CreateSourceCommandSchema)
    .errors(dashboardAuth.error)
    .output(SourceTokenOutputSchema),
};
```

约定：

- **namespace 按业务能力划分**，不按 HTTP method 或文件名划分。当前为 `session`、`destinations`、
  `health`、`i18n`、`integrations`、`operations`、`portability`、`routes`、`settings`、
  `sources`、`suppressions`。`session` 是 dashboard 自己的登录态探测；`/api/auth/*` 留给
  better-auth handler。
- **input / output 一律带 schema**。command schema 直接复用 `@tocsin/core` 中既有的
  `CreateSourceCommandSchema` 等定义，不在契约层复制。
- **只在契约层声明 error code**。dashboard 面统一 `.errors(dashboardAuth.error)`，声明
  `UNAUTHORIZED` / `FORBIDDEN`；客户端的错误处理因此可以只认这几个 code。
- **业务错误按 procedure 声明**。当 service 会抛出领域失败时，该 procedure 额外
  `.errors(resourceErrors.error)` 声明 `NOT_FOUND` / `BAD_REQUEST` / `CONFLICT`
  （`packages/api/src/errors/resources.ts`）。没有声明的 code 仍然会拿到正确 HTTP status，
  只是不属于客户端可 narrow 的类型集合。
- **所有 procedure 都省略 HTTP method 元数据**。oRPC 的 OpenAPI 默认 method 是 `POST`，
  与浏览器侧 `RPCLink` 的默认行为一致：RPC 和 OpenAPI 两个面都用 POST，input 都通过 JSON
  body 传递；不在 contract 中声明 GET/PUT/PATCH。查询语义由 procedure 名和 TanStack Query
  的 `queryOptions()` 表达，不映射成 HTTP GET。这样数字、布尔等类型保持 JSON 原值，不需要
  为 query string 增加 `z.coerce`。
- **output 必须是 safe DTO**。契约是类型层的“返回什么”，不要在 output schema 里放 token hash、
  destination secret、raw sensitive payload。

`src/schemas/*` 放当前能力独有的 output DTO；能被多个能力复用的 schema 仍然回到 `@tocsin/core`。

## 4. 实现层（`apps/console/src/server/orpc`）

### 4.1 共享 implementer

`os.ts` 是整个 console 唯一的 implementer：

```ts
export const os = implement(contract)
  .use(procedureLogging()) // 失败 procedure -> tocsin.orpc 结构化日志
  .use(translateErrors) // 领域错误 -> oRPC 类型化错误
  .use(requestId()); // context.requestId + x-request-id
```

- `implement(contract)` 把契约绑定成可实现对象，`os.sources.list` 这样的路径由契约形状推导，
  procedure 名字写错即类型错误。
- `procedureLogging()` 挂在最外层：内层 `translateErrors` 翻译后的 `ORPCError.code`、以及
  guard 拒绝（`UNAUTHORIZED` / `FORBIDDEN`）在这里都已经是有类型的 oRPC 错误。它只记录失败
  （成功的浏览器调用已由 HTTP request-logging middleware 以 `POST /api/<path>` 记录），
  级别跟随错误映射的 HTTP status：4xx 记 `warn`，5xx 与未翻译的意外故障记 `error`，
  message 走 `safeErrorProperties` 脱敏。requestId 不用在这里注入——HTTP request middleware
  的 `withContext()` 包住整个调用链（含 SSR），日志自动带上同一个 requestId。
- 一个必要的实现细节：oRPC 2 beta 会把根 `os` 上的 middleware 链在每个
  `os.<ns>.router(...)` 和最终 `os.router(...)` 组合时重新叠加一遍。`translateErrors` 和
  `requestId` 是幂等的所以无害；logging 不幂等（一次失败会记 3 条），因此它用 context 上的
  `procedureLogged` 标记去重，只让最外层那一次记录。这也是官方 dedupe-middleware 模式。
- `translateErrors` 把 service 抛出的领域错误映射成 oRPC 错误，见 4.5。它**不声明
  error map**，否则 public procedure 会连带继承 `NOT_FOUND` / `CONFLICT` 这些并不属于它的 code。
- `requestId()` 挂在根上，所有 procedure 都拿到 `context.requestId`，并回写 `x-request-id`。
  同一个请求（浏览器 `/api` 或进程内 `createRouterClient`）拿到的是同一个 id，和 HTTP
  访问日志里的 request id 一致。
- **不要在 `os` 上挂全局 auth middleware**。鉴权按 procedure 显式声明，见 4.3。

### 4.2 根 router 与 feature router

`router.ts` 只做组合，一个 namespace 一行：

```ts
export const router = os.router({
  session: sessionRouter,
  sources: sourcesRouter,
  // ...
});
```

`features/<capability>/router.ts` 是薄适配层。**依赖在文件顶部声明一次，handler 只调用
`context.service`**，不再在 handler 里写 `context.dashboardRequest.container.create*Service()`：

```ts
const withSourceService = withDashboardService((container) => container.createSourceService());

export const sourcesRouter = os.sources.router({
  list: os.sources.list.use(withSourceService).handler(({ context }) => context.service.listSources()),

  create: os.sources.create
    .use(withSourceService)
    .handler(({ context, input }) => context.service.createSource(input)),
});
```

约束：

- **handler 里不写业务逻辑**。校验、鉴权、取 service、返回，仅此而已。真正的规则在
  `*.service.ts`。
- **handler 里不直接碰 SQLite、filesystem 或 env**。`withDashboardService` 已经完成 service
  解析；需要 container 本身时（例如手动跑 worker）才退回裸 `requireDashboard()`。
- **一个 procedure 需要两个 service 时**，各建一个 `with*Service` middleware 并链式 `.use()`；
  不要在一个 middleware 里塞多个不相关的依赖。
- **能力长大了再拆**。单个 `router.ts` 变大时，把一个 procedure 一个文件地拆到
  `features/<capability>/procedures/`，而不是提前铺目录。

### 4.3 middleware

四个文件，都在 `server/orpc/middlewares/`：

- `request-id.ts`：用 `middlewares/request-logging.middleware.ts` 的 `resolveRequestId()` 解析
  request id（复用请求中间件已归一化的 `x-request-id` / `x-correlation-id`），写入
  `context.requestId` 与 `x-request-id` 响应头。挂在根 `os` 上。
- `dashboard-context.ts`：解析 dashboard session 的唯一入口。`requireDashboardContext()` 把
  `DashboardAuthError` / `DashboardAuthorizationError` 映射成 `UNAUTHORIZED` / `FORBIDDEN`；
  `findDashboardContext()` 是宽容版，只把 auth 错误折成 `null`，其它异常继续抛出，供 public
  probe 使用。两个函数都从 `context.reqHeaders` 取 header。
- `require-dashboard.ts`：`requireDashboard()` 调用 `requireDashboardContext()`，把
  `dashboardRequest`（含 `container`）注入 context；`withDashboardService(createService)`
  再在其上注入 `context.service`。
- 三者都**按 procedure 挂**，不挂在 router 或根 `os` 上：

```ts
list: os.sources.list.use(withDashboardService((container) => container.createSourceService())).handler(...)
```

原因：auth、i18n、health 这些 public procedure 不能继承 dashboard 的 error map，而 oRPC 的
error map 是随中间件链声明的。per-procedure 挂载让“这个 procedure 要不要登录”在契约里就能
一眼读出（看它是否声明了 `dashboardAuth.error`）。

**guard 的 output context 是显式类型的**（`os.middleware<{ dashboardRequest }, unknown>(...)`），
所以 `context.dashboardRequest` / `context.service` 在挂过 guard 的 handler 里是非可选的。
没挂 `.use(...)` 就直接读 `context.dashboardRequest` 会在类型检查阶段报错——这正是用来替代
过去 `context.dashboardRequest!` 非空断言的地方。

middleware 从 `context.reqHeaders` 取 header，而不是直接调用 `getRequestHeaders()`：
浏览器请求由 `RequestHeadersHandlerPlugin` 注入 header bag，进程内调用由 `#/lib/orpc.ts` 显式传入。
两种 transport 因此共享同一段鉴权代码。header bag 的 context 类型通过
`declare module "@orpc/server"` 扩展 `DefaultInitialContext` 收窄（见
`apps/console/src/rpc.d.ts`）。

### 4.5 领域错误到 oRPC 错误的映射

`server/orpc/errors.ts` 的 `toContractError()` 是**唯一**把领域错误翻译成 oRPC 错误的函数，
由根 `os` 的 `translateErrors` middleware 调用：

| 领域错误 | oRPC code | HTTP |
| -------- | --------- | ---- |
| `RecordNotFoundError`（`#/infra/sqlite/errors`） | `NOT_FOUND` | 404 |
| `DomainValidationError`（`#/server/runtime/domain-errors`） | `BAD_REQUEST` | 400 |
| `z.ZodError` | `BAD_REQUEST` | 400（message 渲染成 `path: message` 行） |
| `InvalidDeliveryStateError` | `CONFLICT` | 409 |
| 其它 | 原样抛出 | 500 |

没有这层翻译时，service 抛出的任何错误都会以 `INTERNAL_SERVER_ERROR` / "Internal Server Error"
到达浏览器，**原始 message 被丢弃**：operator 在 toast 里看到的是通用服务器故障，而不是
“Destination not found: xxx”或“Invalid TOML configuration: …”。这是 console 日常路径上的
错误（删除已不存在的 Destination、导入格式错误的 TOML），所以必须在边界翻译。

约定：

- **service 用领域错误类表达领域语义**，不认识 oRPC code。repository 继续抛
  `RecordNotFoundError`；service 自己做的领域校验（未知 id、adapter config 非法、导入载荷
  无法解析）抛 `DomainValidationError`。
- **不要为了翻译而在 service 里 `throw new ORPCError(...)`**。那会让 `server/*.service.ts`
  依赖传输层，破坏“service 可被 fake store 单测”的性质。
- **新增领域错误类时同时更新 `toContractError()` 与 `resourceErrors`**，否则新错误会静默退化成
  500。

### 4.4 handler 与路由挂载

`handler.ts` 导出两个 handler，共用同一个 router：

| handler | 路由 | protocol | 用途 |
| ------- | ---- | -------- | ---- |
| `rpcHandler`（`RPCHandler`） | `/api/*` | oRPC RPC | 浏览器客户端 `RPCLink`；dashboard 的主通道 |
| `openAPIHandler`（`OpenAPIHandler`） | `/api/openapi/*` | OpenAPI | 外部调用方、`/spec.json`、`/docs` 参考页 |

两个 handler 都额外挂了 `CORSHandlerPlugin`、`RequestHeadersHandlerPlugin`、
`ResponseHeadersHandlerPlugin`。handler 上**不再挂 `console.error` 的 `onError` 拦截器**：它绕过
LogTape、脱敏和 requestId 关联，而且覆盖不到 SSR 进程内调用。procedure 失败统一由 `os` 上的
`procedureLogging()` 记录（见 4.1），transport 级故障（malformed body、未匹配 procedure）本来就以
4xx 出现在 HTTP 访问日志里，两层合起来没有盲区。

路由文件是标准的 TanStack Start server route，把 HTTP method 全部转给 handler：

```ts
// apps/console/src/routes/api/$.ts
export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: async ({ request }) => await handleRpc(request),
      POST: async ({ request }) => await handleRpc(request),
      PUT: async ({ request }) => await handleRpc(request),
      DELETE: async ({ request }) => await handleRpc(request),
      PATCH: async ({ request }) => await handleRpc(request),
    },
  },
});
```

`handle(request, { prefix })` 返回 `{ matched, response }`；未匹配时返回 404。前缀必须与挂载点
一致，否则 path 解析错位。

**RPC 与 OpenAPI 两个 protocol 不能混用**：`RPCLink` 发的是 `{"json": ...}` envelope，只有 RPC
codec 能解；`OpenAPIHandler` 按 HTTP method + path 匹配。所以 dashboard 与参考页都以 POST 调用；RPC 走 `/api/<procedure path>`，OpenAPI 走
`/api/openapi/<procedure path>`，两者共享同一份 router，OpenAPI 文档描述的就是实际提供的能力。

**webhook intake 不在 oRPC 面上。** `/api/sources/$sourceId/webhook` 仍是一个普通 server route：
它面向第三方监控系统，鉴权靠 Source token，payload 形状由 provider parser 决定，和 dashboard
session 是两条不同的鉴权路径。把它塞进 oRPC 只会让契约承载两种无关的认证模型。

## 5. 客户端（`#/lib/orpc`）

`apps/console/src/lib/orpc.ts` 是唯一的客户端入口，用 `createIsomorphicFn()` 给出两个分支：

```ts
const getRpcClient = createIsomorphicFn()
  .server((): RPCClient =>
    createRouterClient(router, {
      context: async () => ({ reqHeaders: getRequestHeaders() }),
    }),
  )
  .client((): RPCClient => {
    const link = new RPCLink({ url: "/api" });
    return createORPCClient(link);
  });

export const rpcClient: RPCClient = getRpcClient();
export const orpc = createTanstackQueryUtils(rpcClient);
```

要点：

- **SSR 不走 HTTP**。server 分支用 `createRouterClient` 直接进程内调用 router，省掉一次自请求，
  也没有 base URL、cookie 转发的麻烦。但它绕过了 handler 的 `RequestHeadersHandlerPlugin`，
  所以必须显式传 `context.reqHeaders = getRequestHeaders()`——`requireDashboard()` 依赖它。
- **两个 HTTP 面都固定 POST**。契约不声明 method，oRPC OpenAPI 默认 POST；RPCLink 也默认 POST。
  有 input 的 procedure 在 RPC 面用 JSON envelope，在 OpenAPI 面用 JSON request body；不会把
  number/boolean 放进 query string，因此输入 schema 保持严格的 `z.number()` / `z.boolean()`，
  不需要为 transport coercion 扩宽成 `unknown`。
- **feature 层只认 `orpc`**。`orpc.sources.list.queryOptions({ queryKey, input })` 与
  `orpc.sources.create.call(input)` 是 feature `api/*` 的两个基本动作。

`#/lib/orpc.ts` 静态 import `#/server/orpc/router`，而 router 链最终会到 SQLite。这是安全的，
因为 `createIsomorphicFn` 的 server 分支在 build 时被剥离：产物里 client bundle 不含
`better-sqlite3` / `kysely`。这条约束由 console 生产构建把关，属于必须自觉维护的边界——
**不要在 client-safe 代码里出现 feature 的 `#/server/*` 直接导入**，只经由 `#/lib/orpc`。

## 6. feature 层用法

query 侧保留原有的 query key 工厂，只是把执行换成 oRPC：

```ts
export const sourceQueries = {
  list: (filters: SourceFilters) =>
    orpc.sources.list.queryOptions({
      queryKey: sourceKeys.list(filters),
      input: filters,
    }),
};
```

mutation 侧暴露脱离的 procedure 引用，供 hook 直接消费：

```ts
export const sourceMutations = {
  create: orpc.sources.create.call,
  update: orpc.sources.update.call,
};
```

`call` 是绑定在实例上的方法，可以安全地脱离对象传递（不需要 `this`）。UI 调用点因此少了一层
`{ data: ... }` 包装：`await sourceMutations.create(input)`。

查询状态仍然归 TanStack Query，URL 状态仍然归 TanStack Router，表单归 TanStack Form，
这些约定不变。

## 7. 验证方式

- `apps/console/src/server/orpc/server-orpc-auth.test.ts`：断言每个 router 的 procedure 清单与
  契约一致；并**通过真实的 `createRouterClient` 调用**逐个验证 private procedure 在无 session
  时返回 `UNAUTHORIZED`、public procedure 正常返回。断言的是运行时行为，不是源码文本。
- `apps/console/src/server/orpc/errors.test.ts`：通过真实的 `RPCHandler` 验证领域错误映射，
  覆盖 `RecordNotFoundError -> 404`、`InvalidDeliveryStateError -> 409`、`z.ZodError -> 400`
  （message 可读）、未知错误仍是 500、service 抛出的 `ORPCError` 不被改写。
- `vp check`：契约与实现是否对齐由类型检查兜底（console 没有单独的 `typecheck` script）。
- `vp -C apps/console build`：验证 import protection 仍然成立，client bundle 不含 SQLite。
- `apps/console/src/server/orpc/openapi-post-only.test.ts`：遍历 contract，守卫所有 procedure
  均未声明 HTTP method；并验证输入 schema 接受 JSON number、拒绝 numeric string。这样未来
  意外加回 GET 时会先失败，而不会等外部调用者收到 400 才发现。
- 手工验证：登录后访问 dashboard 页面，确认浏览器发出 `POST /api/<ns>/<proc>`；
  `/api/openapi/spec.json` 应将 procedure 生成为 POST + JSON request body，且无 query 参数。

## 8. 参考

- oRPC 官方文档：<https://orpc.unnoq.com/>
- TanStack Query 集成：<https://orpc.unnoq.com/docs/integrations/tanstack-query>
- OpenAPI 集成：<https://orpc.unnoq.com/docs/openapi/integrations/implement-contract-first-server>
- 仓库内 `orpc`、`orpc-contract`、`orpc-openapi` skills（`.agents/skills/`）。
