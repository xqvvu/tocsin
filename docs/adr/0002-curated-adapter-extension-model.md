# 仓库内精选适配器扩展模型

Tocsin 的 provider 和 destination 扩展优先服务仓库内维护的精选适配器，而不是运行时安装第三方插件。`@tocsin/providers` 和 `@tocsin/destinations` 暴露 TypeScript adapter 对象、schema-backed manifest 和纯 parse/send 行为；`apps/console` 继续负责存储、编排、密钥保护、UI 渲染、重试策略和 worker 生命周期。

这个选择让 MVP 的集成贡献保持小而可审查，避免过早引入插件沙箱、依赖隔离、运行时包加载和动态 UI 执行。公开 adapter 形态使用 `defineProviderAdapter` 与 `defineDestinationAdapter` 这类 identity helper，而不是 abstract class，因为 adapter 是静态能力描述加纯函数行为，不是有生命周期的服务对象。

Adapter manifest 可以描述配置字段、能力、secret 路径和安全摘要，但不能导出 React 组件。console 可以根据 manifest 渲染常见字段；复杂表单作为 feature module 里的 override 存在。

Provider 和 destination 只共享展示元数据、配置字段描述、secret 字段声明、安全摘要等 manifest primitives。两者保持独立接口：provider adapter 把入站 Webhook 载荷解析成规范化告警，destination adapter 负责预览和发送出站通知。

（由 `docs/adr/0009-oncall-feishu-urgent.md` 提出，2026-10-10 已随 `packages/destinations/src/urgency/` 实现）出站通知与主动呼叫人是两种语义，因此 adapter 家族在 provider 与 destination 之外新增第三类 urgency channel adapter：`UrgencyChannelAdapter`（`kind` / `ping`，没有 manifest / `configSchema`）与 `UrgencyRegistry`，落在 `packages/destinations/src/urgency/`，复用本 ADR 已确立的全部纪律，即结构化 `ok` union、封闭 error kind、retry hint、只接收已校验 typed config、不碰 DB/container/logger、通过注入的 `fetch` 与 `now` 访问 transport。`UrgencyChannelKind` 同样是封闭枚举。不把加急做成 `DestinationAdapter` 的可选方法加 capability 标志：那会让能力真相分裂成两处，并被迫打开本 ADR 明确封闭的 capabilities schema。

Secret 处理不能只从表单字段描述推导。Adapter manifest 同时暴露 UI 字段描述和独立的 secret 字段声明，并通过测试或 registry audit 保持可见 secret 字段的一致性。这样 console 可以渲染友好的表单，同时把导出、日志、摘要和 DTO 脱敏锚定在明确的服务端安全边界上。

Provider parser 可以接收 typed Source config，用于 severity 映射、默认标签、metadata 选择等解析行为。Webhook 认证仍由 console 服务层拥有，以便 Source token、额外共享密钥、审计行为和拒绝响应在所有 provider 之间保持一致。

Adapter 的预期失败用结构化结果表达，而不是依赖任意 thrown error。Provider parse 失败返回稳定原因，console 可据此记录 parser-failure Event；destination send 失败返回标准错误分类，如 HTTP 错误、目标系统拒绝、网络失败、超时、配置错误和未知错误。异常只表示非预期 bug 或最后防线。

Destination adapter 可以返回 retry hint，但最终重试策略和 Delivery 状态转移由 console worker 拥有。Adapter 负责表达目标系统语义，例如某个错误是否显然可重试；worker 负责最大次数、退避、手动重试和未来 per-destination retry policy。

完整 adapter 对象只存在于服务端 registry。浏览器 UI 通过 server function 获取 client-safe adapter catalog DTO，只包含展示文案 key、图标引用、可渲染字段和公开能力；不把 `parse`、`send`、schema 对象、secret 规则内部实现或运行时代码直接打进客户端 bundle。

Client-safe catalog 不返回完整 `secretFields`，只通过 `configFields.sensitive` 暴露 UI 所需的敏感字段行为。`secretFields` 作为服务端安全边界留在完整 adapter manifest 中，由 registry audit 保证它与可见 sensitive 字段一致。

Catalog capabilities 使用封闭 schema，而不是开放 `record<string, boolean>`。Provider 与 destination 的公开能力分开建模，未来新增能力需要显式扩展 schema，避免 typo 或任意 capability bag。

Adapter config 的演进由 adapter 和 console 分担：adapter manifest 声明当前 `configVersion`，并可提供纯函数迁移旧 config；console 配置服务负责在 SQLite/TOML import/export 等流程中执行迁移、持久化结果和报告人工处理需求。迁移函数不能访问数据库、网络、env 或全局 runtime。

默认 adapter 使用显式集中注册，不做文件系统自动发现或 glob import。集中注册文件是默认支持清单，测试负责审计 core 枚举、registry、manifest、i18n/catalog 和 secret 字段声明之间的一致性。

每个第三方 adapter 使用独立目录模块，而不是继续堆在 package 根层的单个 `.ts` 文件中。目录模块让 adapter 实现、fixtures、自测和未来特定辅助函数保持局部性；package 根只聚合默认支持清单，并通过子路径导出暴露单个 adapter，例如 `@tocsin/destinations/feishu` 或 `@tocsin/providers/grafana`。

MVP 保持 `SourceProvider` 和 `DestinationKind` 为封闭枚举。由于 Tocsin 不支持运行时第三方插件，封闭枚举能让 SQLite/TOML、UI、i18n、图标、registry 和测试保持可穷尽校验；adapter catalog 负责减少 console 的手写分支，而不是通过开放字符串放松边界。

新增 adapter 的最低测试契约包括 adapter 自测和 registry/catalog audit。Provider 自测覆盖代表性 payload、规范化字段、指纹、idempotency、metadata 脱敏、结构化失败和 config 影响；destination 自测覆盖 schema、preview 脱敏、请求形状、响应解析、错误分类、retry hint 和 rendered payload。Console 集成测试只在新增字段类型、表单 override、secret ref 行为或特殊预览/测试行为时增加。

Manifest primitives 放在 `@tocsin/core`，包括配置字段、secret 字段、能力、client-safe catalog DTO 和 config version 等共享 schema。完整 `ProviderAdapter` 与 `DestinationAdapter` 接口留在 `@tocsin/providers` 和 `@tocsin/destinations`，避免 core 承载 parse/send/fetch 等 integration runtime 行为。

`@tocsin/core` 中的 manifest primitives 必须保持 JSON-safe 和可序列化，只包含数据 schema、字段描述、catalog DTO、lifecycle 与 config version 等契约。它们不能包含函数、class、React component、RegExp、fetch、parse/send、transport context 或任何运行时 adapter 行为。

运维配置摘要默认由 console 从 runtime config 投影生成，adapter 可在服务端提供 override。Tocsin 是
私有部署产品：摘要应对已认证操作者展示 endpoint URL、method、收件人、模板 mode 等运维事实；签名
密钥、密码与敏感 header 值不进入摘要。复杂 adapter 可以返回更贴近目标系统语义的 `JsonObject`，
但不得把 signing secret / password 放进 list 或 ordinary query DTO。

MVP 中 provider adapter 每次 parse 仍返回单个规范化告警，对应一个入站 Webhook 形成的告警事件。包含多个 alert item 的上游载荷先由 adapter 归并为一个规范化告警，并在 metadata 中记录 `alertCount`、group key 等信息。未来如要支持 batch fan-out，必须重新讨论 Event 语义、raw payload 归属、request-level 与 item-level idempotency、delivery dedupe、route match 和 UI 详情模型，而不能只把 parse 返回值改成数组。

Adapter runtime 只接收已经解析、已经校验的 typed config。SQLite/TOML 中的 `secretRefs`、环境变量引用、未来 secret store 解析、缺失 secret 报错和导入导出策略都由 console 的配置边界处理；adapter 不关心 secret 来自哪里，也不直接读取 env、TOML 或持久化结构。

Provider manifest 可以声明认证需求或可选认证方式，但认证执行属于 console 服务层。所有 Source 默认使用 Tocsin Source token；额外共享密钥、共享 header、未来 HMAC 等能力由 manifest 描述，console 用它渲染配置、保存 secret refs、执行认证和审计，provider parse 不做认证裁决。

Destination transport context 保持小而显式，先稳定 `fetch`、`now`、timeout、user agent 等通用能力。Adapter 不能接收 app container、数据库、logger 或任意服务对象；如果未来需要 SMTP 等新 transport，需要明确扩展 context，而不是让 destination adapter 直接读取全局 runtime。

Config field path 只支持安全 dot path，不支持数组下标、通配符或表达式。数组、列表和 map 通过 `string-list`、`key-value` 等字段类型表达；路径安全规则与 TOML `secret_refs` 使用的 secret path 规则保持一致。

Config field type 在 MVP 中是封闭集合，不允许 adapter 自定义字段类型。通用字段由 console 的 adapter-aware form renderer 渲染；需要 OAuth flow、富编辑器、复杂嵌套 builder 等特殊交互时，在 console feature module 中显式实现 override。

`AdapterConfigField` 使用 Zod discriminated union，而不是一个充满可选属性的松散对象。每个 field type 只暴露自己需要的属性集合，方便 UI 按 `type` 收窄渲染，也方便 registry audit 检查 select options、number range、key-value 行为等字段级不变量。

Config field 可以声明 `sensitive: true` 作为 UI 语义，表示编辑时不回显原值、走 secret 输入体验，并用 `preserve`、`replace`、`clear` 三态提交。服务端安全真相仍然来自独立的 `secretFields`，不能只依赖字段渲染元数据。

`secretFields` 使用封闭 `kind` 分类，例如 `token`、`webhook_url`、`signing_secret`、`password`、`api_key`、`endpoint_url`、`header`。该分类服务 env hint、安全摘要和 redaction helper，不引入自定义 redaction policy DSL。

Adapter manifest 只声明稳定 icon id/name，client-safe catalog 也只返回 icon id/name。Console 负责把 icon id 映射到实际 SVG 或 asset URL，并提供缺省 fallback；adapter 不导出 React icon component，也不依赖 bundler-specific asset URL。

Adapter manifest 使用 i18n key 而不是最终 UI 文案。文案归 console i18n 文件维护，registry/catalog audit 负责检查 key 存在；开发 fallback 只能作为调试辅助，生产 UI 不依赖 fallback label。

落地采用分阶段 tracer bullet，而不是一次性大重构。先在 core 建 manifest primitives，再选择一个 destination adapter 打通 `defineDestinationAdapter`、字段描述、secret 声明、config version、结构化错误、retry hint、transport context 和 registry/catalog audit；随后接入 console catalog DTO，再迁移剩余 destinations、providers，最后逐步替换为 manifest-driven 表单渲染。

Adapter config 的运行时默认值以 `configSchema` 为唯一真相。Manifest 字段可以提供 `defaultValue` 作为 UI 初始化提示，但 registry audit 必须校验它与 schema parse 后的默认值一致；不能只在 UI 层定义默认值。

持久化的 Source/Destination runtime config 必须始终通过 adapter schema 校验。UI 可以在本地持有未完成草稿，但 SQLite 和 TOML 不保存 invalid draft；如果未来需要草稿生命周期，应单独建模，而不是污染运行时配置表。

长期目标是 config 更新采用完整 replacement，而不是服务层隐式 deep merge。UI 可以在提交前组装完整 config；secret 的保留、替换和清空必须用显式命令语义表达，避免旧字段残留、kind 切换污染和可选字段无法删除。

Secret 字段编辑使用 `preserve`、`replace`、`clear` 三态意图。编辑已有配置时空输入默认保留旧 secret；替换和清空必须由用户显式表达。服务层把非 secret replacement 字段与 secret edits 组合成完整 runtime config，再用 adapter schema 校验后保存。

Destination preview 和 Delivery rendered payload 都是 safe debug representation，不承诺等于实际 wire payload。真实 secret 只能在 `send` 内部用于构造网络请求；preview、测试结果、Delivery 详情和持久化 rendered payload 都必须省略或脱敏 secret、签名、token、密码和敏感目标地址。

Provider metadata 由 adapter 产出，但 console 在入库前进行统一脱敏兜底。Adapter 不应把 secret、认证 header、完整敏感 URL 或 raw auth config 放入 metadata；测试需要覆盖 metadata 脱敏，console 仍负责最后的安全边界。

路由规则不匹配 `providerMetadata` 或 raw payload。MVP 的稳定路由面只包括 Source、severity、status、labels、title 和 message；需要参与路由的 provider-specific 信息必须由 adapter 提升为 label 或未来明确扩展的 normalized field。

Adapter 生成 labels 需要遵守轻量规范。Label 表达可路由上下文，优先使用 `service`、`environment`、`cluster`、`namespace`、`team` 等稳定短 key；`environment` 是 Tocsin 的 canonical 环境标签。高基数字段、trace/request id、时间戳、完整 URL、错误堆栈和不适合路由的 provider 信息应进入 metadata 或 raw debug data，而不是默认进入 labels。

`@tocsin/core` 只定义 normalized event 的枚举和 schema，不承载 provider-specific 映射经验。`@tocsin/providers` 可以提供共享 normalization helper，供 adapter 复用 severity/status/label 归一化逻辑；特殊 provider 语义由对应 adapter 显式处理。

Generic provider 和 generic webhook destination 保持简单声明式能力，不引入 JavaScript、JSONPath/JMESPath、条件表达式、动态签名脚本、多步骤 enrichment 或通用 body transform DSL。它们可以支持常见字段提取、有限映射、默认标签、安全模板和 HTTP 参数，但不能把 Tocsin 扩展成低代码工作流引擎。

Adapter manifest 可以声明简单 lifecycle status：`stable`、`experimental` 或 `deprecated`。该状态用于 catalog 展示、新建表单提示、TOML import warning 和废弃迁移说明；它与 `configVersion` 分离，不引入复杂兼容矩阵。

每个 adapter 必须显式声明 lifecycle status，不能默认 stable。`stable` 是维护承诺，`experimental` 和 `deprecated` 是产品可见状态；deprecated adapter 应提供 replacement kind 或 message key 说明迁移路径。

每个 adapter 必须显式声明 `configVersion`，从 `1` 开始。该版本只描述当前 adapter config 的形状演进，不等同于 package 版本；破坏性配置变化需要升版本并提供迁移或人工处理路径。

MVP 不让 adapter manifest 控制 rate limit 或 concurrency。Delivery worker 先使用全局 batch/backoff 策略；per-destination 限流、并发、429 处理和 UI 策略未来作为 worker 架构议题单独设计。Manifest 可保留非强制 operational hint，但不能暗示已有调度保证。

Adapter 不接收 logger 或 metrics client，但结构化结果必须包含 console 可记录的稳定可观测维度，例如 adapter kind、parser/config version、parse failure reason、destination error kind、retry hint 和 HTTP status。Console 决定这些字段如何进入 Event metadata、Delivery attempts、日志和未来 metrics。

Core 中的 catalog item 以泛型 `Kind extends string = string` 表达，具体 provider/destination package 再收窄到 `SourceProvider` 或 `DestinationKind`。Config field path 不做从 Zod config schema 推导 dot path 的复杂静态类型，使用安全 path schema 加 registry audit 校验，避免贡献者被高级 TypeScript 类型困住。

Destination send result 使用 `ok` discriminated union 替代 `success: boolean`。成功分支不携带错误字段；失败分支必须包含标准 error kind、retry hint 和安全错误消息。`statusCode` 与已脱敏 `responseBody` 是通用 nullable 字段，HTTP destination 填写实际值，非 HTTP transport 可为 `null`。脱敏覆盖敏感键与高置信值形态（认证 scheme、URL userinfo、Slack/飞书 webhook URL），不承诺覆盖无前缀裸 token 或 generic webhook path/query 中的 secret。

Destination send result 的两个分支都必须携带 safe `renderedPayload`。该字段是用于 preview 和 Delivery detail 的调试表达，不承诺等于实际 wire payload；即使渲染或发送失败，也应返回安全占位 payload，避免 UI 和 worker 处理 optional payload。

（2026-10-08 由 `docs/adr/0009-oncall-feishu-urgent.md` amend）Destination send result 增加可选的 `providerReference`，形状为 `{ type, value }`，例如 `{ type: "feishu_message_id", value: "om_..." }`，表示目标系统里可反向操作的资产句柄。它不破坏 `ok` union 纪律：只在成功分支有实际意义，adapter 拿不到句柄时直接省略，console 落 `deliveries.provider_ref_type` / `provider_ref_value` 两列并投影进 Delivery detail，使后续对同一条消息的二次操作（如飞书加急）不必再改 schema。`type` 是开放字符串命名空间，由各 adapter 自行约定，core 不枚举；`value` 是运维标识符而不是 secret，可以进入已认证 dashboard 的 detail DTO。

Destination adapter 应尽量捕获预期 transport 失败并返回结构化 failure，例如 network error、timeout、provider rejection 或 auth/configuration error。Console worker 的 catch 只作为非预期 adapter bug 或最后防线，而不是正常错误分类机制。

Transport context 中的 `fetch` 应由 console/container 提供为策略化 wrapper，统一处理默认 timeout、user agent、未来 proxy/network policy 和测试 fake。Adapter 使用该 `fetch` 与 `now()`，不各自实现全局 timeout 策略；个别 destination 的 timeout 需求只能作为 operational hint 交给 console 决定。

`defineDestinationAdapter` 从顶层 `configSchema` 推断 typed config，贡献者通常不需要显式传泛型。Adapter 对象使用 `manifest: { ... }` 分区承载 JSON-safe 静态描述，`configSchema`、`preview` 和 `send` 放在 manifest 外；完整 manifest 可以包含 `secretFields`，但 client catalog projection 必须移除它。

Destination `preview` 和 `send` 共享同一个 render input：event id、source summary、destination summary、normalized event 和 typed config。`preview` 不接收 transport context，避免预览路径发起网络请求；adapter `preview` 只返回 safe `JsonValue`，console service 负责包装 destination summary 等 DTO。

Provider parse result 使用 `ok` discriminated union，与 destination send result 保持一致。成功分支返回 normalized event、provider metadata 和 idempotency key；失败分支返回封闭 failure reason、安全消息和可选 metadata。只有认证通过且 Source enabled 的 parse failure 才记录 parser-failure Event，未认证、source 不存在或 disabled 的请求不记录 Event。

Provider parse input 使用 redacted headers 和 JSON-safe `JsonValue` payload。Raw headers 只供 console 认证层使用，provider parser 不接收 raw auth headers；API boundary 负责把 webhook body 转成 JSON-safe payload。

Provider parse input 使用 `source: SourceSummary`，不平铺 `sourceId/sourceName`，也不传 `tokenHash` 或含 secret 的 runtime source 对象。Provider adapter 也使用顶层 `configSchema` 并由 `defineProviderAdapter` 自动推断 typed config。

Provider/Destination registry 可以暴露 `get`/`list` 供服务端编排和 audit 使用，但业务路径应优先依赖窄方法，例如 `parse`、`send`、`preview`、`parseConfig`、`toCatalog`。Delivery worker 等调用方可以依赖 `Pick<Registry, "send">` 这类窄接口，避免到处读取 adapter internals。

Client-safe catalog projection 由 registry/package 提供，console service 只负责 dashboard auth、server function 包装、未来 feature flag 或权限过滤。Projection 和安全 audit 放在 registry 侧，避免 console 重复知道如何移除 `secretFields`、schema 和 runtime methods。

Registry 注册阶段校验硬性 manifest 不变量并在代码错误时 throw，例如 duplicate kind、kind 不在 core enum、非法 config version、非法 lifecycle、非法 field/secret path、非法 field type 或 capabilities。Audit 方法检查跨 adapter/软规则，例如 enum 与 registry 完全一致、sensitive 与 secretFields 对齐、deprecated replacement 存在、catalog 不含 forbidden keys、默认值与 schema 一致。

Registry audit 是可复用纯方法，测试必须强制通过；开发环境可以提示 warning，生产启动不默认因为软 audit warning 阻塞自托管实例。明显非法 adapter 仍在注册阶段失败。
