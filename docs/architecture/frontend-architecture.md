# 前端架构（TanStack Start Console）

本文档定义 Tocsin console 的前端分层规则。目标不是抽象地描述 React 项目，而是为当前
TanStack Start 单体应用提供可执行的迁移方向：**route-first + feature modules + oRPC
boundary + query cache + shadcn primitives**。

适用范围：`apps/console/src/`。产品范围、领域语言和 MVP 约束以
`docs/prd/self-hosted-alert-hub-mvp.md` 为准；后端依赖组装以
`docs/architecture/application-container.md` 为准；SQLite 持久化边界以
`docs/architecture/sqlite-store.md` 为准；oRPC 契约、implementer 与 client 访问方式以
`docs/architecture/orpc-api-layer.md` 为准。

---

## 1. 当前结构

`apps/console/src/routes/index.tsx` 当前只是根 URL redirect 到 `/events`。Dashboard 已拆成
`_dashboard` layout route，以及 Sources / Routes / Destinations / Events / Deliveries /
Suppressions / Integrations / Settings 的页面路由；`login` 与 `setup` 是未认证入口。新增前端
代码应继续沿用 route-first 形状：

1. `routes` 决定 URL、layout、search params、loader、beforeLoad 和薄渲染入口。
2. `features` 按业务对象纵切 Sources、Routes、Destinations、Events、Deliveries。
3. `features/operations` 仍暂时承载 Events/Deliveries 共享 query、filter、DTO re-export 和 worker mutation；Events/Deliveries 的页面 UI 正在向各自 feature 收敛。
4. `server` 是 server-only 的分层后端：`server/orpc/` 提供 oRPC implementer 和按能力拆分的 procedure router，`*.service.ts` 承载业务逻辑；跨 client/server 的共享契约（oRPC contract、命令 schema、DTO）放在 `@tocsin/api` 与 `@tocsin/core` 包，浏览器统一通过 `#/lib/orpc` 调用 procedure。
5. `components/ui` 只保留 shadcn primitives，不知道 Tocsin 的领域。
6. `components/common` 承载跨 feature 复用的 console UI 组合，但不拥有业务规则。
7. `infra` 是 SQLite 与 server-only 基础设施，前端代码不可导入。

---

## 2. 目录职责

当前推荐结构：

```txt
apps/console/src/
  routes/
    __root.tsx
    index.tsx
    login.tsx
    setup.tsx
    _dashboard.tsx
    _dashboard.sources.tsx
    _dashboard.routes.tsx
    _dashboard.destinations.tsx
    _dashboard.events.tsx
    _dashboard.events_.$eventId.tsx
    _dashboard.deliveries.tsx
    _dashboard.deliveries_.$deliveryId.tsx
    _dashboard.suppressions.tsx
    _dashboard.suppressions_.$suppressionId.tsx
    _dashboard.integrations.tsx
    _dashboard.settings.tsx
    api/
  shell/
    dashboard-layout.tsx
    dashboard-user-menu.tsx
    dashboard-error.tsx
    dashboard-not-found.tsx
  features/
    sources/
      api/
      model/
      ui/
    routes/
      api/
      model/
      ui/
    destinations/
      api/
      model/
      ui/
    events/
      model/
      ui/
    deliveries/
      model/
      ui/
    operations/
      api/
      model/
      ui/
    configuration/
      api/
      model/
      ui/
    suppressions/
      api/
      model/
      ui/
    integrations/
      api/
      model/
      ui/
    auth/
      api/
  components/
    ui/
    common/
  middlewares/
    request-logging.middleware.ts   # 请求日志
    csrf.middleware.ts              # 写请求 CSRF 校验（start.ts 与日志中间件一起注册）
  server/
    orpc/                     # oRPC implementer、feature router、middleware、handler
      os.ts, router.ts, handler.ts, openapi.ts
      features/<capability>/router.ts
      middlewares/            # request-id、require-dashboard
    runtime/                  # container、request context、dashboard session 类型
    configuration/            # *.service.ts/*.service.types.ts + config portability
    sources/                  # source.service.ts, source.service.types.ts
    destinations/             # destination.service.ts, destination.service.types.ts
    routes/                   # route.service.ts, route.service.types.ts
    operations/               # event-replay.service.ts, event-replay.service.types.ts
    deliveries/               # delivery-worker.service.ts, delivery-worker.service.types.ts
    intake/                   # intake.service.ts, intake.service.types.ts
    suppressions/             # suppression.service.ts, suppression.service.types.ts
    integrations/             # feishu-app.service.ts 等飞书应用能力
    oncall/                   # 加急呼叫 service 与 worker
  lib/
    orpc.ts                   # isomorphic oRPC client：SSR 走 createRouterClient，浏览器走 RPCLink
  infra/
    sqlite/                   # connection, migrations, codecs, store assembly
      repositories/
        source/               # source.interface.ts, source.helpers.ts, source.repository.ts
        destination/
        route/
        intake/
        delivery/
        history/
        settings/
        suppression/
        feishu-app/
        oncall/
```

> 共享命令 schema、操作 DTO 等 client/server 契约放在 `@tocsin/core` 包，oRPC contract
> 放在 `@tocsin/api` 包；
> 仅后端使用的类型（如 dashboard session 类型）就近放在 `server/runtime/`。
> 不再保留 console 级的 `contracts/` 目录。

### `routes`

`routes` 是 URL 和路由生命周期层，只负责：

- 定义 URL 层级、index/detail route、dashboard layout route。
- 用 `validateSearch` 校验 URL search params，再把它们转成 feature query 所需的 typed
  filters、pagination、selected tab 等输入。
- 用 `loaderDeps` 明确 loader 依赖哪些 search params 或 route params。
- 用 `loader` 预取 route 级数据，但只通过 feature 暴露的 `queryOptions` 间接取数，那些
  query 函数内部走 oRPC procedure。
- 用 `beforeLoad` 做导航体验相关的 guard，例如未登录时提前跳到 `/login`。
- 渲染薄入口：把 loader/search/params 交给 feature screen 或 app shell，不在 route 文件里写
  大型表单、表格、详情面板和业务状态机。

`routes` 不直接导入 `#/infra/*`、`#/server/runtime/container.ts`、SQLite store、仓储、
worker、secret helper 或任何 server-only 基础设施。route 文件可以导入 feature 的
`queryOptions`，但不能越过这些边界去读持久化层，也不直接 import `#/server/orpc/*`。

### `features`

`features` 按 Tocsin 的产品对象纵切。MVP 第一批 feature 是：

- `features/sources`：Source summary/detail DTO、source query keys、list/detail
  `queryOptions`、create/update/disable/rotate-token mutations、Source 表单、Sources 表格、
  webhook URL 展示与复制 UI。
- `features/routes`：Route rule form model、query/mutation、规则摘要、启停、Routes 表格与
  表单。这里的 Routes 指 Tocsin 的告警路由规则，不是 TanStack Router 文件路由。
- `features/destinations`：Destination form model、preview/test mutations、operator-visible
  config DTO、Destinations 表格、测试结果与预览 UI。
- `features/events`：Events 页面/详情 UI、normalized fields 展示、raw debug data 的脱敏展示、
  route match 表格。
- `features/deliveries`：Deliveries 页面/详情 UI、attempts 表格、状态 badge、失败信息展示。
- `features/operations`：Events/Deliveries 暂共享的 query keys、list/detail query、filter/search
  model、retry/run worker mutations、格式化 helper。RC 收尾阶段可再拆成 events/deliveries 各自
  api/model。
- `features/suppressions`：静默规则列表/详情、创建与编辑表单、命中记录，以及从事件、标签或
  通知目标预填的静默对话框。
- `features/integrations`：飞书应用资源的管理、校验与测试连接 UI。
- `features/configuration`：Settings 偏好、运行时信息面板与 TOML 导入/导出 UI。
- `features/auth`：登录、初始化 owner 与认证表单实现。

每个 feature 可以拥有自己的 `api/`、`model/`、`ui/` 和测试。feature 层可以组合 shadcn
primitives、TanStack Form、TanStack Table、TanStack Query hooks，也可以调 oRPC procedure；
但它不能导入 `infra`、SQLite store、application container 或 server-only runtime。需要服务端
数据时，feature 通过自己的 query/mutation 文件集中使用 `#/lib/orpc` 暴露的
`orpc.<namespace>.<procedure>` 工具，把 query key、`queryOptions`、mutation 和 invalidation
封装在 feature 内。

### `shell`

`shell` 承担 dashboard 的稳定应用外壳：

- dashboard layout。
- sidebar / primary nav。
- header / breadcrumb / page actions slot。
- user menu 与 session summary。
- 全局 loading、error、empty shell 状态。

shell 可以知道“这是 Tocsin console 的 dashboard”，可以展示 Sources、Routes、Destinations、
Events、Deliveries、Suppressions、Integrations、Settings 导航项，但不实现这些 feature 的
表单、表格、loader 和 mutations。
`routes/_dashboard.tsx` 应主要挂载 shell、执行 dashboard UX guard，并渲染子路由 outlet。
通用表格、分页、复制控件、面板、tooltip、状态 badge 等不属于 shell；它们应放在
`components/common`，避免 feature 为了复用 dashboard 外壳而反向依赖 shell。

### `components/ui`

`components/ui` 只存放 shadcn primitives 和项目从 shadcn registry 接管的原子组件，例如
`Button`、`Field`、`Input`、`Select`、`Table`、`Badge`、`Skeleton`、`Alert`、`Tabs`、
`Dialog`、`Sheet`、`Drawer`。

这一层必须保持领域无知：

- 不出现 Source、Destination、Delivery、Event、Route 等 Tocsin 领域词。
- 不调用 oRPC procedure、TanStack Query hooks、TanStack Router hooks。
- 不放业务 badge、业务表格、业务空状态或业务 form model。
- 不读取 auth session、SQLite、env、secret 或 raw payload。

领域 UI 属于 `features/*` 或 `shell`。例如 `DeliveryStateBadge` 应在
`features/deliveries`，不是 `components/ui`。

### `components/common`

`components/common` 存放跨 feature 复用、但高于 shadcn primitive 的 console 组合组件，例如：

- 运营型表格外壳、分页和简单表格。
- 复制代码行、图标 tooltip、通用内容面板和表单面板。
- 通用启用/停用状态 badge、非领域化的状态呈现 helper。

这一层可以沉淀 Tocsin console 的密度、边框、分页和 row height 等视觉约定，但仍必须保持业务
无知：

- 不出现 Source、Destination、Event、Delivery、Route 等特定业务规则。
- 不调用 oRPC procedure、TanStack Query hooks、mutation hooks 或 TanStack Router hooks。
- 不导入 `infra`、application container、server-only runtime 或 secret helper。
- 不承载 feature 专属 actions、empty state、route coverage、provider/destination kind、delivery
  state 等领域组件。

判断标准：如果组件表达的是“所有 console feature 都应该长得一致的 UI 结构”，放
`components/common`；如果组件表达的是“某个 Tocsin 业务对象应该展示哪些字段或动作”，放 owning
feature。

### 共享契约（`@tocsin/api` 与 `@tocsin/core`）

client 与 server 之间的共享契约分成两层，都必须保持 env-neutral：只包含类型、Zod schema、
DTO 与命令/结果投影，不导入 `#/server/*`、`#/infra/*`、`node:*` 或带 TanStack Start import
protection 的模块。相关文件：

- `@tocsin/api`：oRPC contract（`contract/`）、共享 error map（`errors/`）、procedure input/output
  schema（`schemas/`）与 client 类型（`client.ts` 的 `RPCClient`）。契约是 client/server
  共享的 API 形状，也是类型漂移的守卫。
- `@tocsin/core` 的 `configuration-commands.ts`：Source/Destination/Route/Settings/导入导出的
  command schema。
- `@tocsin/core` 的 `operations.ts`：Events/Deliveries 列表与详情 DTO、worker 健康投影等跨边界形状。
- `server/runtime/dashboard-session.ts`：`DashboardSession` 与 dashboard auth 错误类型；仅后端
  消费，因此不放进共享包，而是就近放在 runtime。

实现私有的 option/input/row-mapping 类型仍贴近实现文件，不强制外置。详见
`docs/adr/0004-console-plain-layered-structure.md`；oRPC 边界细节见
`docs/architecture/orpc-api-layer.md`。

### `server`

`server` 是 server-only 的分层后端：`server/orpc/` 的 procedure router 是 controller 入口，
`*.service.ts` 是按能力组织的服务层实现，导出的 service option/result 类型放在相邻的
`*.service.types.ts`。它**按能力分目录**，不是按技术种类堆放：

- `server/orpc`：oRPC implementer（`os.ts`）、root router（`router.ts`）、RPC/OpenAPI handler
  （`handler.ts`、`openapi.ts`）、按能力拆分的 `features/<capability>/router.ts`
  和 procedure middleware（controller 层 / client/server 边界适配）。
- `server/runtime`：application container、request context、dashboard session/auth 类型、
  delivery worker runner 等跨能力运行时基础设施。
- `server/configuration`：应用设置与可移植配置，即 `app-settings.service.ts`、`config-portability.*`
  与 `configuration-support.ts`（TOML/JSON import/export）。
- `server/suppressions`、`server/integrations`：静默规则与飞书应用能力；容器按能力暴露
  `createSuppressionService`、`createFeishuAppService` 等工厂，没有聚合门面。
- `server/sources`、`server/destinations`、`server/routes`：各能力的服务端 `*.service.ts` /
  `*.service.types.ts`，与 `features/<同名>` 左右对称。
- `server/intake`：webhook 接入解析与 `intake.service.ts`（`WebhookIntakeService`）。
- `server/deliveries`：`delivery-worker.service.ts` 与 delivery execution。

oRPC procedure 是浏览器进入服务端业务能力的默认边界。procedure 由 contract 约束
validation，负责认证、建立 request context、调用 service、返回 secret-safe DTO。新增 dashboard
数据读写不要绕过 procedure 直接从 client/route loader 访问 store。service 依赖
`server/runtime`，runtime 不反向依赖具体 service；`server/*` 不依赖 `features/*`。

### `infra`

`infra` 是 server-only 基础设施。当前主要是 SQLite：

- SQLite connection、migrations、`sqlite/repositories/<module>/`、store。
- filesystem、database handle、migration internals。
- 未来若有 server-only transport、secret storage，也属于这里。

`infra` 不为前端提供导入面。任何出现在 client bundle、route loader serialized data、query
data 或 feature UI 中的数据，都必须先经过 `server` 投影成安全 DTO。

---

## 3. Loader、oRPC 与 Query Cache

Tocsin console 的数据流固定为：

```txt
route validateSearch/params
  -> feature queryOptions
  -> TanStack Query cache
  -> #/lib/orpc（SSR: createRouterClient / 浏览器: RPCLink -> POST /api/$procedure）
  -> server/orpc/features/<capability>/router.ts
  -> service
  -> infra SQLite / provider registry / destination registry
```

浏览器侧 `#/lib/orpc` 通过 `createIsomorphicFn` 分叉：SSR 用 `createRouterClient` 在进程内直接
调用 router，浏览器用 `RPCLink` 打到 `/api`。因此 procedure 的 context 必须从请求 headers
解析（`context.reqHeaders`），保证两条路径都拿到同一份 session。细节见
`docs/architecture/orpc-api-layer.md`。

route loader 的职责是把 URL 状态转成 query 输入，并通过 QueryClient
`ensureQueryData(queryOptions(...))` 预取需要的数据。loader 不直接读
`openSqliteStore()`、`getApplicationContainer()`、`infra/sqlite/repositories`、worker runner 或任何
server-only infra 模块。

查询规则：

- 每个 feature 维护自己的 query key factory，key 必须是数组、可序列化，并包含影响结果的
  filters、pagination、id 等变量。
- Sources、Destinations、Routes、Settings 等配置能力分别维护列表或详情 query，不使用一份全量
  configuration snapshot 作为所有页面的共享缓存。跨能力页面在 route loader 中并行预取所需
  query，并在 feature page 内组合只读投影；不要为组合方便重新引入聚合 service 或聚合 query。
- 列表与详情拆成不同 query key，例如 `["events", "list", filters]` 与
  `["events", "detail", eventId]`。
- route loader 使用 feature `queryOptions` 保持 SSR/预取/客户端 hook 同源；query 函数内的
  procedure 调用与客户端 hook 是同一条 oRPC 路径。
- mutation 成功后由 feature mutation 做定向 invalidation，不在 route 文件里散落
  `router.invalidate()` 作为主要刷新机制。
- 删除告警源或投递目标会清理路由引用，因此对应 mutation 同时失效自身列表与 Routes；配置
  import 会改写 Settings、Sources、Destinations 与 Routes，因此 portability 工作流失效四类 query。
- 非缓存型一次性动作，例如复制文本、打开详情面板本地状态，可以留在组件本地；改变服务端状态
  的动作必须走 mutation/oRPC procedure。

oRPC procedure 规则：

- 所有输入用 schema 校验。
- 每个 private dashboard procedure 在 contract 上声明 `dashboardAuth.error`，并在实现处用
  `withDashboardService((container) => container.createXService())` 声明依赖并建立 dashboard
  request context；handler 只调用 `context.service`。只有需要 container 本身的 procedure 才用
  `requireDashboard()`。public procedure（`health`、`i18n`、`session.getDashboardSession`）不挂该 middleware。
- 每个 webhook API route 都用 Source token 或 Tocsin 侧额外共享密钥认证，不依赖 dashboard session。
- 返回值是 client-safe DTO，不返回 repository row、raw secret config、database object 或
  service 实例。

---

## 4. Dashboard 授权边界

dashboard route 的 `beforeLoad` 可以存在，但它只是 UX guard：提前发现没有 session 的用户，
减少页面闪烁，并把用户导航到 `/login`。

真实授权必须发生在服务端边界内：

- dashboard oRPC procedure 通过 `requireDashboard()` 调用 dashboard request context，确认
  Better Auth session 与 owner/admin 权限。
- 触碰 user-owned data、runtime config、Source/Destination/Route/Event/Delivery 的 API route
  必须在 handler 内鉴权。
- webhook intake API route 用 Source token 或 Tocsin 侧额外共享密钥鉴权，不能因为 dashboard
  `beforeLoad` 已经保护了 UI 就跳过服务端认证。

原因很简单：`beforeLoad` 保护的是浏览器导航体验，不保护 `/api`、`/api/openapi`、
API route、脚本调用、过期 hydration data 或绕过 UI 的请求。

---

## 5. 敏感数据投影规则

以下内容永远不能进入 client DTO、route loader data、TanStack Query data、route context、
client component props、TOML/JSON 默认导出或浏览器日志：

- Source token 原文。
- `tokenHash`。
- provider signing secret。
- Destination webhook URL 中的 secret 部分。
- Destination signing secret、access token、password、private key。
- raw sensitive config。
- Better Auth secret、session token、password hash。
- SQLite database handle、filesystem path、migration/runtime internals。
- 未脱敏的 raw headers 与 raw payload 中的常见敏感字段。

可以进入客户端的是明确投影后的安全信息：

- Source/Destination/Route summary。
- 是否已配置 secret 的布尔状态或 `masked` 标记。
- 新建或轮换 Source token 后的一次性 token notice。该 notice 只在用户明确触发的响应中展示，
  不写入 query cache，不放进 loader data，不通过长期可重放的 route data 传递。
- normalized Event fields、Delivery state、attempt metadata。
- 脱敏后的 raw debug view，且只在 detail/debug UI 中展示。

测试应覆盖“procedure 返回值不包含 token hash、destination secret、raw sensitive config”
这类边界。

---

## 6. UI 组合规则

Tocsin 是重复使用的 SRE 运维工具，前端默认选择密集、冷静、可扫描的界面：

- 列表页优先表格、过滤器、分页、行操作、详情页或 drawer。
- Sources、Routes、Destinations 的启停、删除、测试、轮换 token 等动作必须显式且可复核。
- Sources 与 Destinations 这类配置列表应共享表格外壳、分页、状态 badge、row height 和动作密度；
  具体列内容、route coverage 和 actions 仍由各自 feature 拥有。
- Destinations 表格默认展示能指导操作的事实：目标 identity（包含 adapter kind）、启停状态、
  启用路由覆盖、运维配置摘要（endpoint URL、method、收件人、模板 mode），以及 test / preview /
  edit / toggle actions。Tocsin 是私有部署产品，已登录的 dashboard 操作者应能直接看到排障所需
  配置；签名密钥、密码、Source token 与敏感 Header 值仍不得进入 list/query DTO。
- Destinations 的“最近 delivery 健康度”应作为后续服务端安全汇总 DTO 接入，例如最近成功/失败时间、
  失败计数、最后错误摘要和 pending/running job 数；不要在前端从 raw payload、secret config 或完整
  delivery detail 临时拼装。
- Events、Deliveries 优先展示 normalized fields、状态、时间、失败原因、attempts 和 route
  match 信息。
- 表单行为由 TanStack Form 管理；shadcn `FieldGroup`、`Field`、`FieldLabel`、
  `FieldDescription`、`FieldSet`、`FieldLegend` 管结构与可访问性。
- 表格行为由 TanStack Table 管理；shadcn `Table`、`Button`、`Input`、`DropdownMenu`、
  `Checkbox`、`Badge`、`Skeleton`、`Empty` 管视觉结构。
- 不为 dashboard 做 marketing hero、大卡片堆叠或装饰性图表。首页可以是 operational summary，
  但应由 feature 数据投影组成，而不是把所有业务 UI 塞回 `index.tsx`。

---

## 7. 当前收敛方向

Dashboard mega-route 拆分已经完成：`routes/index.tsx` 现在只负责把根 URL redirect 到
`/events`，具体页面由 `_dashboard.*.tsx` file routes 承担。后续前端整理不再以“大拆
`index.tsx`”为主，而是按以下小步收敛：

1. Events / Deliveries 仍通过 `features/operations` 共享 query、filter、DTO re-export 和 worker
   mutation。若某个页面开始拥有明显不同的查询输入、缓存失效或详情 DTO，再拆到各自的
   `features/events/api|model` 与 `features/deliveries/api|model`。
2. Sources / Routes / Destinations / Settings 的路由文件继续保持薄入口：URL search validation、
   loader prefetch、渲染 feature page。新增表单、表格、dialog、空状态和 row action 放在 owning
   feature。
3. 可复用的表格外壳、分页、复制控件、通用 enabled/disabled badge 和通用面板放进
   `components/common`；业务列、业务 badge、route coverage、provider/destination kind、delivery
   state 仍留在 feature。
4. Server state 统一通过 feature query/mutation 文件访问 oRPC procedure；route loader 只用同一组
   `queryOptions` 并行预取，不直接 import store、container 或 service。配置页面按能力组合
   Settings、Sources、Destinations 与 Routes query，不恢复全量 configuration snapshot。
5. 每次新增 client-visible DTO 或 detail/debug 展示，都同步检查投影边界：Source token、token hash、
   签名密钥、密码、敏感 header 值不得进入 query data；运维配置（endpoint、method、收件人、模板
   元数据）可以进入已认证 dashboard DTO。raw payload/header 继续按敏感 key 脱敏后供 detail 调试。

如果后续新增 dashboard landing page，应创建明确的 `_dashboard.index.tsx`，并让它像其他 route
一样只组合 feature query 与 feature UI，不把业务逻辑重新堆回 `routes/index.tsx`。

---

## 8. 守护性测试与检查

前端架构迁移至少需要这些测试或静态检查方向：

- route search params 的 schema validation：非法 severity/status/deliveryState 不进入 query。
- route loader 使用 feature `queryOptions`，不直接导入 `infra`、store、container。
- dashboard oRPC procedure 与 API routes 在服务端重新鉴权。
- feature query data 不包含 Source token、`tokenHash`、Destination secret、raw sensitive
  config。
- shadcn primitives 保持领域无知；业务 badge/table/form 不放进 `components/ui`。
- `components/common` 不导入 feature、query/mutation hook、route hook 或 server-only 模块；业务
  badge、业务 table cell 和业务 actions 留在 owning feature。
- Events/Deliveries 的过滤、分页、详情 query key 包含影响结果的变量。
- mutation 成功后定向 invalidation，而不是依赖整页 reload。

这些检查是为了让后续迁移可以小步推进，同时保住 Tocsin 最重要的产品质量：用户能信任它收到
了什么、如何归一化、为何路由、发给了哪里、失败后如何重试，并且 secrets 没有被前端泄漏。
