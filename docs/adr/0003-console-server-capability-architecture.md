# Console 服务端按能力组织与顶层共享契约

> 部分被取代：`0004-console-plain-layered-structure.md` 取代了本 ADR 中"顶层 `contracts/` 目录"与"`ConfigurationService` 聚合门面"两项决定——共享 command schema / DTO 已折入 `@tocsin/core`，dashboard session 类型移至 `server/runtime/dashboard-session.ts`，门面已移除，文件改名为 `*.service.ts` / `*.service.types.ts` / `*.repository.ts`。本 ADR 的其余结论（运行环境边界优先、`server/` 按能力分目录、dynamic import 只作边界适配、跨边界 DTO 单一定义）仍然有效。

Tocsin console 保持**运行环境边界为第一边界**：顶层目录区分 client-safe、server-only 和 shared，三者由 TanStack Start import protection、console build，以及针对 server function 鉴权的窄测试守护。我们不采用 client 与 server 代码交错进同一目录的纵切 module 形态，因为那会把"这个文件能否进浏览器 bundle"的判断从"看顶层目录"退化为"看子目录加文件后缀"，并迫使导入边界规则复杂化，而 TanStack Start 的保护本身只认文件后缀和 `server-only` 副作用 import，不认文件夹层级。

`apps/console/src/application/` 重构为 `apps/console/src/server/`。名字直接表达"此处不进浏览器"，比"application"这个抽象分层词更贴近 TanStack Start 的实际约束；同时它消除"application 既像 DDD application layer、又像 server 边界、又像运行时组装根"的语义重载。

`server/` 内部**按业务能力（领域）分子目录，而不是按技术种类**。重构前 `application/` 把 `services`、`runtime`、`http`、`portability`、`functions`、`contracts` 这些不同性质的东西平铺在一起，导致单个领域（如 Source）的服务逻辑、server function、密钥处理散落在多个技术分组里，阅读时必须横跨整棵树。重构后 `server/sources`、`server/destinations`、`server/routes`、`server/deliveries`、`server/intake`、`server/configuration` 各自聚合该能力的服务，并与 `features/<同名>` 左右对称，使"某个领域在前端和服务端分别做了什么"成为一次性可见的事实。当前 `*.functions.ts` 暂统一放在 `server/functions/`。

`runtime` 仍是 `server/` 下的独立子目录，承载**真正跨领域的服务端基础设施**：application container、request context、dashboard session/auth 类型、delivery worker runner。它们不属于任何单一能力，强行塞进某个能力目录会制造错误的归属感。能力服务依赖 runtime，runtime 不依赖任何单一能力服务。

历史上 `application/contracts/` 曾被提升为顶层 `apps/console/src/contracts/`，作为 client 与 server 之间的共享缝。0004 之后这层目录已删除：共享 command schema、输入校验器、跨边界 DTO 和共享枚举投影进入 `@tocsin/core`；仅后端使用的 dashboard session 类型留在 `server/runtime/dashboard-session.ts`。实现私有的 option/input/row-mapping 类型仍贴近实现文件，不强制外置。

`ConfigurationService` 这个跨 5 个领域、约 570 行的"上帝服务"按能力拆分为 `SourceService`、`DestinationService`、`RouteService`、`AppSettingsService`，TOML 导入导出归 `ConfigPortabilityService`。这是本次重构的核心收益：领域代码混在一团是"读起来吃力"的真正来源，而它无法靠改目录名解决。迁移过程中曾短暂保留 `createConfigurationService()` 作为聚合门面；当前门面已移除，container 直接暴露各 service factory。

Dynamic import 只作为**边界适配手段**，不作为普通解耦或绕编译错误的工具。允许的场景是：client-importable 文件（`*.functions.ts`、function middleware、SSR-safe wrapper、`*-impl` 懒加载）刻意延迟拉入 server-only 或 browser-only 实现，以避免把它们静态打进 client bundle。不允许的场景是：一个 server-only 模块为了打破循环依赖而 dynamic import 另一个 server-only 模块——这类循环必须通过把共享类型/错误下沉到 `contracts/` 来消除，而不是用 dynamic import 压住。

`dashboard-auth` 是上述循环的历史典型：它在同一文件里同时定义契约（`DashboardSession`、`DashboardAuthError`、`DashboardAuthorizationError`、`GetDashboardSession`）和实现（`requireDashboardSession` 等），而 `request-context` 静态依赖这些契约，于是 `dashboard-auth` 只能 dynamic import 回 `request-context`。迁移先把契约移出以消除循环；当前 `dashboard-auth.ts` wrapper 已删除，类型和错误类在 `server/runtime/dashboard-session.ts`，实际鉴权在 `server/runtime/request-context.ts`。

跨边界 DTO 必须**单一定义、共享引用，不在两端各写一份**。`operations` 的 `EventListItem`、`DeliveryListItem`、`WorkerHealthSnapshot` 等投影已迁入 `@tocsin/core` 的 `operations/operations.ts`，由 infra/server 返回类型与 client feature 共同引用。

类型与实现的拆分粒度沿用最小必要原则：**只强制分离跨边界共享的 public contract，不强制每个 private type/interface 外置**。只服务当前 class/function 的 constructor options、私有 helper 的 input/output、SQLite row mapping 中间类型、test-only fake 类型，以及 schema/contract 文件内的 `Zod schema + inferred type` 配对，都可以留在实现文件里，避免把代码切成无意义的 `types.ts + impl.ts` 而抬高跳转成本。

依赖方向单向收敛：`@tocsin/core` 不依赖任何运行环境特定模块；`features/*`（client-safe）可依赖 `@tocsin/core` 与 server function 代理，不依赖 `server/*` implementation、`infra/*` 或 runtime；`server/*` 可依赖 `@tocsin/core`、`infra/*` 与 workspace packages，但**不反向依赖 `features/*`**；`server/<能力>` 依赖 `server/runtime`，runtime 不依赖任何单一能力服务；`routes` 只依赖 `features/*` 的 client 面或 `@tocsin/core`，不直接触达 `server/*` 实现。

落地采用**行为不变的小步迁移**，而不是一次性大搬家。迁移记录见 `docs/architecture/console-server-restructure-plan.md`；当前执行规则见 `AGENTS.md`、`docs/architecture/application-container.md` 与 `docs/architecture/tanstack-start-import-boundaries.md`。

不采用的替代方案：

- **纯纵切 `modules/<能力>/{contract,client,server}`**：能力 ownership 最强，但 client 与 server 在同一 module 树交错，弱化顶层运行环境边界，迫使重写边界测试，且相对当前体量的迁移成本与回归风险偏高。本 ADR 用"server 内部按能力分 + 顶层 contracts"获取大部分 ownership 收益，同时保住简单可靠的顶层边界。
- **把服务端能力搬进 `features/*`**：会让 client 与 server 重新混入同一 feature 树，正好退回本次重构要消除的 server/client 混合问题。`features/*` 维持 client-facing 语义。
- **仅把 `application/` 改名为 `server/` 而不拆服务、不动内部组织**：只是把"大杂烩"换个名字，570 行的上帝服务与技术分组平铺依旧，无法解决阅读吃力的核心问题。
