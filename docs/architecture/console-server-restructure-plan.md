# Console 服务端重构迁移记录

> 状态（2026-06-17，后附补充）：本文件是历史迁移记录，不再是待执行计划。当前服务端结构以
> `docs/adr/0004-console-plain-layered-structure.md`、`docs/architecture/application-container.md`、
> `docs/architecture/frontend-architecture.md` 和 `AGENTS.md` 为准。
>
> 补充：`docs/adr/0007-console-orpc-api-boundary.md` 之后，client/server 边界已从
> `server/functions/*.functions.ts` 换成 `server/orpc/` 的 oRPC procedures，本记录中
> 涉及 `server/functions/` 的目录与步骤描述均为当时的历史状态。

本记录对应 `docs/adr/0003-console-server-capability-architecture.md` 的落地过程。0003 解决了
早期 console 服务端目录混杂、server-only 类型与实现混放、server function 为绕导入边界而使用
dynamic import 的问题。随后 0004 又把结构进一步简化为当前的朴素分层。

---

## 当前落点

当前代码不再保留 console 级 `contracts/` 目录，也不再保留 `ConfigurationService` 聚合门面：

```txt
apps/console/src/
  server/
    functions/          # TanStack Start server functions
    runtime/            # container, request-context, dashboard-session, worker runner
    configuration/      # app settings + config portability services
    sources/            # source.service.ts + source.service.types.ts
    destinations/       # destination.service.ts + destination.service.types.ts
    routes/             # route.service.ts + route.service.types.ts
    intake/             # intake.service.ts, webhook-request.ts
    deliveries/         # delivery worker service + delivery execution
  infra/sqlite/
    repositories/       # <module>/{*.interface.ts, *.helpers.ts, *.repository.ts}
    migrations/
    store.ts
  features/
    sources/
    routes/
    destinations/
    events/
    deliveries/
    operations/         # Events/Deliveries 暂共享 query/filter/worker model
    configuration/
```

跨 client/server 的 command schema 与 DTO 已迁入 `@tocsin/core`：

- `packages/core/src/configuration/configuration-commands.ts`
- `packages/core/src/operations/operations.ts`

仅后端使用的 dashboard session 类型与 dashboard auth 错误就近放在
`apps/console/src/server/runtime/dashboard-session.ts`。历史上的 `dashboard-auth.ts` wrapper 已删除；
实际鉴权逻辑在 `server/runtime/request-context.ts`。

---

## 已完成的迁移

1. 拆分早期聚合配置服务：Source、Destination、Route、AppSettings、配置 portability 分别落到
   `SourceService`、`DestinationService`、`RouteService`、`AppSettingsService`、
   `ConfigPortabilityService`。
2. 消除 dashboard auth / request context 的类型与实现循环：dashboard session 类型和 auth error
   独立出来，随后在 0004 后收敛到 `server/runtime/dashboard-session.ts`。
3. 统一 Events/Deliveries 操作投影：operation DTO 迁入 `@tocsin/core`，feature 侧从 core re-export。
4. 服务端目录从早期 `application` 形态收敛为当前 `server` 目录；repository 从 console 顶层移入
   `infra/sqlite/repositories`。
5. `*.service.ts` 只承载实现，导出的 service option/result 类型放在相邻的
   `*.service.types.ts`。
6. 更新 server function 边界：private dashboard server functions 通过
   `requireDashboardContextMiddleware` 取得 request context；public auth probe 可在 handler 内直接调用
   runtime accessor 并捕获认证错误。

---

## 当前验证口径

服务端结构或导入边界发生变化时，至少运行：

```sh
vp -C apps/console fmt:check
vp -C apps/console lint
vp -C apps/console test run
vp -C apps/console build
```

触碰 provider/destination/core 共享契约时，再补对应 package 的测试。

---

## 相关文档

- `docs/adr/0003-console-server-capability-architecture.md`
- `docs/adr/0004-console-plain-layered-structure.md`
- `docs/architecture/application-container.md`
- `docs/architecture/frontend-architecture.md`
- `docs/architecture/tanstack-start-import-boundaries.md`
