# 应用容器与请求上下文（`apps/console/src/server/runtime`）

本文档定义 Tocsin 在 TanStack Start 单体应用中的后端依赖组装方式。当前代码采用朴素分层：oRPC procedure 与 API route 作为入口，service 承载业务逻辑，SQLite repository 承载持久化。`server/runtime` 只放跨能力的运行时组装与请求上下文；oRPC 契约与 implementer 形状见 `docs/architecture/orpc-api-layer.md`。

Tocsin 的 MVP 约束不变：单进程、SQLite-first、server-only 后端运行时；不引入 NestJS 风格 decorator IoC，也不引入第三方 DI 容器。

---

## 1. 设计原则

1. **默认运行时只存在于 `apps/console`。** `@tocsin/core`、`@tocsin/providers`、`@tocsin/destinations` 只暴露共享 schema、provider parser、destination sender 和 registry，不依赖 console 的运行时。
2. **业务运行时的长期依赖放在 application container。** SQLite store、provider registry、destination registry、Better Auth database、Better Auth instance、delivery worker runner 由 `server/runtime/container.ts` 懒加载并缓存。LogTape 这类应用级 instrumentation 由 server entry 初始化，不放入 container。
3. **请求级信息放在 request context。** dashboard session/current user、request id、headers、当前请求时间等每次请求不同的数据只在 `server/runtime/request-context.ts` 创建的 context 中存在，不能塞进全局 container。
4. **入口层保持薄。** oRPC procedure 和 API routes 只做输入校验、建立 context、从 container 获取 service、调用业务方法、映射 safe DTO。
5. **service 显式可注入。** `SourceService`、`DestinationService`、`RouteService`、`AppSettingsService`、`ConfigPortabilityService`、`WebhookIntakeService`、`DeliveryWorker` 都通过构造函数接收依赖；测试可以不经过默认 container。

---

## 2. Application Container

`apps/console/src/server/runtime/container.ts` 是默认 server-only wiring object。它直接 import Better Auth、env、SQLite connection/store 和默认 registry，因此保留 `import "@tanstack/react-start/server-only";`。

默认 container 使用 ESM module cache 做懒加载：第一次调用 `getApplicationContainer()` 时创建，后续在同一个 server module 实例内复用。不要把 container 挂到 `globalThis`。如果开发模式 HMR 或测试需要释放默认实例，调用 `disposeApplicationContainer()`；它会停止 delivery 与 oncall worker runner，并关闭已打开的 SQLite store / Better Auth database。

| 依赖                   | 生命周期                | 说明                                                                                                                                                                                                                                        |
| ---------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SqliteStore`          | 默认 container 内懒加载 | 默认使用 `env.TOCSIN_DATABASE_PATH`，应用显式 migrations。承载 Sources、Routes、Destinations、Events、Deliveries、Feishu Apps、Oncall、Settings 等仓储。                                                                                       |
| `ProviderRegistry`     | 默认 container 内懒加载 | 默认来自 `createDefaultProviderRegistry()`，用于把 Source payload 解析为 normalized Event。                                                                                                                                                 |
| `DestinationRegistry`  | 默认 container 内懒加载 | 默认来自 `createDefaultDestinationRegistry()`，用于校验 Destination config、preview 和 send。                                                                                                                                               |
| `UrgencyRegistry`      | 默认 container 内单例   | 默认来自 `createDefaultUrgencyRegistry()`，注册 `feishu_urgent_phone` 渠道。它是 destination registry 的并列家族（呼叫而不是通知）；渠道实例按凭证缓存 `tenant_access_token`，所以必须进程内单例，不能按请求新建。                            |
| Better Auth database   | 默认 container 内懒加载 | 使用与 SQLite store 同一套 Kysely-first connection/migration 入口。Better Auth 拥有 auth 表读写，Tocsin 不把 auth 表包装成业务 repository。                                                                                                   |
| `AuthServer`             | 默认 container 内懒加载 | Better Auth server runtime，通过 Kysely SQLite adapter 配置连接数据库，包含 HTTP handler 与 `api.getSession(...)`。                                                                                                                         |
| `DeliveryWorkerRunner` | 默认 container 内单例   | 由 `DeliveryWorker` + store + destination registry + env worker 配置组装，维持 MVP 的 in-process SQLite-backed delivery worker。                                                                                                            |
| `OncallWorkerRunner`   | 默认 container 内单例   | 由 `OncallWorker` + store + `UrgencyRegistry` + `DestinationConfigResolver` 组装，复用 `createDeliveryWorkerRunner`（它对队列形状无感知），维持加急队列的 in-process 轮询。                                                                 |
| service factory        | 每次调用新建            | `createSourceService()`、`createDestinationService()`、`createRouteService()`、`createFeishuAppService()`、`createAppSettingsService()`、`createConfigPortabilityService()`、`createWebhookIntakeService()`、`createDeliveryWorker()`、`createOncallService()`、`createOncallWorker()`、`createSuppressionService()`、`createSessionSecurityService()`、`createStorageHealthService()`、`createWorkerHealthService()`、`createEventReplayService()`、`createOperationsService()`、`createRuntimeInformationService()` 返回显式注入依赖的 service 实例。 |

加急切片的接线要点：`createDeliveryWorker()` 在成功分支注入窄接口 `triggerPings`（由 `OncallService.triggerPingsForDelivery` 提供）；该依赖缺省时投递行为与加急之前完全一致，触发内部抛错也只记日志，不会把已成功的投递改判失败。`DestinationConfigResolver`（`server/integrations/destination-config-resolver.ts`）在投递发送、目标测试、加急执行三条路径上按 `app.appRef` 解析应用凭证后再交给 adapter，secret 不落库、不进 DTO。

公开地址接线：容器解析 `publicBaseUrl`（`env.SERVER_URL`，缺失时回落到 `env.BETTER_AUTH_URL`）并注入 `createDestinationService()` 与 `createDeliveryWorker()`，用于渲染告警模板里的 `tocsin.eventUrl`。两个地址都没有时该变量为空；内置预览样例与没有样例的测试发送使用合成事件 id，也不生成链接。

当前目录形状：

```txt
apps/console/src/server/
  runtime/
    container.ts                 # 默认 server-only wiring object，缓存长期依赖
    request-context.ts           # 每次请求创建 dashboard/webhook context
    dashboard-session.ts         # DashboardSession 与 dashboard auth 错误类型
    delivery-worker-runner.ts    # 进程内 worker interval runner
    logging.ts                   # server-only LogTape 配置与 AsyncLocalStorage
    log-safety.ts                # env-neutral 日志字段与 Error 脱敏
    system-information.ts        # 版本、Node、SQLite 等启动时信息
    runtime-information.service.ts # Settings 可读的运行时白名单投影
    storage-health.service.ts    # SQLite 容量与表行数只读投影
    worker-health.service.ts     # 投递/加急 worker 最近运行状态投影
    health.types.ts              # readiness/health 共享类型
    domain-errors.ts             # 运行时侧领域错误辅助
    store.ts                     # 兼容窄 accessor，委托 application container（无生产 importer，仅 store.test.ts）
  orpc/
    os.ts                        # implement(contract) + request-id middleware
    router.ts                    # root router，组合各 feature router
    handler.ts                   # RPCHandler + OpenAPIHandler
    openapi.ts                   # OpenAPI reference / spec 插件
    features/
      session/router.ts          # dashboard session（root router 有意不叫 auth，避免与 Better Auth 混淆）
      destinations/router.ts
      health/router.ts
      i18n/router.ts
      integrations/router.ts
      operations/router.ts
      portability/router.ts
      routes/router.ts
      settings/router.ts
      sources/router.ts
      suppressions/router.ts
    middlewares/
      request-id.ts
      require-dashboard.ts
  configuration/
    app-settings.service.ts
    app-settings.service.types.ts
    config-portability.service.ts
    config-portability.service.types.ts
    config-portability.ts
  sources/source.service.ts
  suppressions/
    suppression.service.ts
    suppression.service.types.ts
  destinations/destination.service.ts
  routes/route.service.ts
  integrations/
    feishu-app.service.ts
    destination-config-resolver.ts
  oncall/
    oncall.service.ts
    oncall-execution.ts
    oncall-worker.service.ts
  operations/event-replay.service.ts
  security/
    session-security.service.ts
    session-security.service.types.ts
  intake/
    intake.service.ts
    webhook-request.ts
  deliveries/
    delivery-worker.service.ts
    delivery-execution.ts
```

Middleware 分两层：`apps/console/src/middlewares/request-logging.middleware.ts` 是在 `start.ts` 注册的全局 request middleware；`apps/console/src/server/orpc/middlewares/` 下的 `request-id.ts` 与 `require-dashboard.ts` 是 oRPC procedure middleware。自定义 `start.ts` 同时显式注册 TanStack Start CSRF middleware，不能用 request logging 替换 CSRF。

---

## 3. Request Context

`apps/console/src/server/runtime/request-context.ts` 每次请求创建，不缓存到全局对象。它负责请求级信息：

| 字段                                | 说明                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `container`                         | 当前请求使用的 application container。默认是进程级 container，测试可传入 fake container。                                             |
| `headers` / `headersRecord`         | 当前请求 headers。oRPC procedure 通过 `context.reqHeaders` 取得（SSR 走 `getRequestHeaders()`，浏览器走 RPC 请求）；API routes 从 `Request` 读取。 |
| `requestId`                         | 全局 request middleware 校验 `x-request-id` / `x-correlation-id`，缺失或无效时生成 UUID；直接构造 context 的测试调用可以保持 `null`。 |
| `now`                               | 当前请求时间的 ISO 字符串，可在测试中注入 clock。                                                                                     |
| `dashboardSession` / `currentUser`  | 仅 dashboard context 拥有，来自 Better Auth session，并要求 `owner` 或 `admin`。                                                      |
| `sourceToken` / `hasProviderSecret` | 仅 webhook context 拥有，来自 Source token 或额外共享密钥 header。                                                                    |

Dashboard context 与 webhook context 是两条不同认证边界：

- Dashboard procedures 在实现处 `.use(requireDashboard())` 注入 `context.dashboardRequest`。该 middleware 内部调用 `requireDashboardRequestContext()`，使用 Better Auth session，并拒绝非 owner/admin 用户。
- Public auth probes（如 `session.getDashboardSession`）不能挂会提前抛错的 dashboard middleware；它们可以在 handler 内直接调用宽容版 `findDashboardContext()`，把 auth 错误折成 `null` 后返回。
- Webhook API route 调用 `createWebhookRequestContext()`，只读取 Source token / 额外共享密钥，不读取 dashboard session。上游监控系统不需要也不应该拥有浏览器 session。

`server/runtime/dashboard-auth.ts` 已删除。session 类型和 auth error 在 `dashboard-session.ts`，实际鉴权逻辑在 `request-context.ts`。

LogTape request context 与 dashboard/webhook auth context 不是同一个对象。前者通过
`AsyncLocalStorage` 只传播 `requestId` 等安全关联字段；后者持有认证所需 headers/token 信息。不要把
`headersRecord`、`sourceToken` 或 session token 复制到日志 context。

---

## 4. 入口如何获取依赖

### oRPC Procedures

Dashboard procedure 的固定形状（实现位于 `server/orpc/features/<capability>/router.ts`）：

```ts
const withSourceService = withDashboardService((container) => container.createSourceService());

export const sourcesRouter = os.sources.router({
  create: os.sources.create
    .use(withSourceService)
    .handler(({ context, input }) => context.service.createSource(input)),
});
```

这个入口只负责 input validation（contract 已声明 schema）、通过 middleware 建立 dashboard context 并解析 service、调用业务方法。Sources、Routes、Destinations、Settings、配置 portability 分别调用 container 暴露的对应 service factory，不再经过单一 `ConfigurationService` 门面。

`withDashboardService()` 让 router 文件在顶部声明一次依赖，handler 只认 `context.service`；需要 container 本身的 procedure（如手动跑 delivery worker）使用裸 `requireDashboard()` 并读 `context.dashboardRequest.container`。guard 的 output context 是显式类型的，所以忘记挂 guard 会在类型检查阶段失败，而不是靠 `!` 断言掩盖。

`server/orpc/*` 是 server-only implementer，浏览器不导入它。浏览器侧只导入 `#/lib/orpc`（isomorphic client），它经 `#/server/orpc/router` 建立 SSR 进程内调用或 `/api` 网络调用。procedure handler 内可以使用窄 runtime accessor 或 `context.dashboardRequest.container`；不要在 module 初始化阶段调用 runtime/container。

### API Routes

Webhook API route 的固定形状：

```ts
export async function handleSourceWebhookPost(input: {
  sourceId: string;
  request: Request;
}): Promise<Response> {
  const context = createWebhookRequestContext({ request: input.request });
  const service = await context.container.createWebhookIntakeService();

  // 读取和限制 raw JSON payload 后，调用 WebhookIntakeService。
}
```

Webhook intake 认证是 Source token / 额外共享密钥；它不会调用 `requireDashboardRequestContext()`，也不会读取 Better Auth session。

### Worker

Delivery worker 是进程级后台循环，默认通过 container 组装：

```ts
const runner = await getApplicationContainer().ensureDeliveryWorkerRunner();
```

默认 container dispose 时必须停止该 runner。`container.ts` 在支持 HMR 的运行时中注册 `import.meta.hot.dispose(disposeApplicationContainer)`，避免开发模式热替换后遗留旧 interval 和旧 SQLite 连接。

手动触发 worker（例如 dashboard 的 run-once procedure `operations.runDeliveryWorker`）通过 request container 创建临时 worker：

```ts
const worker = await context.dashboardRequest.container.createDeliveryWorker();

return worker.runOnce({ limit });
```

Oncall worker（`server/oncall/oncall-worker.service.ts`）与 delivery worker 同形状：`ensureOncallWorkerRunner()` 复用同一个 `createDeliveryWorkerRunner` 工厂（它只依赖 `runOnce()` 与 health snapshot，对队列无感知），`oncall` runner 与 delivery runner 在 container 里并列，各自持有独立 timer，但共用同一组 env 配置（`TOCSIN_WORKER_INTERVAL_MS` 轮询间隔、`TOCSIN_WORKER_BATCH_SIZE` 每轮上限），dispose 时一起停止。它也照抄 reclaim → claim(due) → execute 顺序，退避复用 `DeliveryBackoffOptions`。加急的 run-once 入口是 `operations.buzzDelivery` 之后的 best-effort `dispatchNow`，失败只记日志并交由 runner 重试。

### Logging Runtime

`apps/console/src/server.ts` 在 server entry 启动时配置一次 LogTape。Logging Runtime 不通过
container 暴露 logger，也不加入 service constructor options。Console 内业务模块直接取得分类 logger；
provider/destination adapter 继续只返回稳定结构化结果，不接收 logger。

详细 category、level、request middleware 和 secret-safe 规则见
`docs/architecture/observability.md`。

---

## 5. 客户端可见性边界（私有部署）

Tocsin 是 self-hosted 产品。已认证 dashboard 操作者应能看到排障所需的运维配置；只有真正的密钥与
进程内部句柄必须留在 server-only 模块、SQLite、Better Auth adapter 或服务端响应前的局部变量里。

**不得进入 client components、route loader serialized data、query data 或 procedure 返回值：**

- Source token 原文、`tokenHash`、额外 shared secret / provider signing secret。
- Destination `signSecret`、SMTP/网关密码、敏感 Authorization/header 值。
- Better Auth secret、session token、password hash、auth database handle。
- SQLite database handle、filesystem path、migration/runtime internals。
- raw headers/raw payload 中按敏感 key 判定的字段（token、password、authorization 等）。

**可以进入已认证 dashboard 投影的运维信息：**

- Destination operational config：endpoint URL、host、HTTP method、收件人、模板 mode/source、
  header 名称列表、是否已配置签名密钥（不含值）。
- Source / Destination summary、Route definition、Event normalized fields、Delivery state。
- 按敏感 key 脱敏后的 response body 或 raw debug data。

---

## 6. 为什么不使用 decorator IoC

Tocsin 的后端是 TanStack Start 单体应用，MVP 需要的是清晰的 server-only 组装边界，而不是框架级对象生命周期管理。Decorator IoC 或第三方 DI 容器会带来几个问题：

- 需要运行时 metadata、decorator 编译约定或额外包，增加自托管部署和调试成本。
- 隐藏构造依赖，反而让 Sources、Routes、Destinations、Events、Deliveries 的 service 边界不如构造函数参数直观。
- 容易把 request session、request id、locale 等请求级状态错误注册成 singleton。
- 对当前规模过度设计：Tocsin 只有一个进程、一个 SQLite store、少量 registry 和几个 service factory。

推荐模式是普通 TypeScript object/factory：container 负责默认长期依赖，request context 负责请求级依赖，业务 service 保持显式构造函数。这足够支持测试替身、未来扩展 provider / destination，也不会牺牲 TanStack Start 的 client/server 分离。

---

## 7. 测试守护

应保持这些测试方向：

- container factory 可以用 fake store / fake registry 构造 service，证明业务 service 没有写死全局 singleton。
- 默认 container 通过 ESM module cache 复用；调用 `disposeApplicationContainer()` 后必须停 worker、关闭已打开的数据库连接，并允许后续请求重建新 container。
- dashboard procedures 必须通过 `requireDashboard()` / `withDashboardService()` middleware 或等价的 dashboard request context 认证；`server-orpc-auth.test.ts` 以运行时调用逐个断言。
- service 抛出的领域错误（`RecordNotFoundError`、`DomainValidationError`、`InvalidDeliveryStateError`、`z.ZodError`）必须在 oRPC 边界被翻译成 4xx，而不是退化成 500；`errors.test.ts` 覆盖该映射。
- webhook route 不导入也不调用 dashboard request context，Source token / 额外共享密钥认证路径保持独立。
- client components、route loaders、serialized data 不导入 server-only container，也不返回 token hash、Destination secret、raw sensitive config。
- 全局 request middleware 必须同时保留 CSRF middleware，并证明并发 request context 不串线。
- 运行日志不包含 raw headers/payload/config/response body、credential 或 raw Error；secret-safe intake → delivery 和 worker callback 测试保持通过。
