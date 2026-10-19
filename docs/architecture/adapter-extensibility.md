# Provider 与 Destination 适配器扩展性设计

本文档整理 Tocsin 在 `@tocsin/providers`、`@tocsin/destinations` 与 `apps/console`
之间的适配器扩展边界。详细决策背景见
`docs/adr/0002-curated-adapter-extension-model.md`。

## 设计目标

Tocsin 的扩展性优先服务仓库内维护的精选适配器，而不是运行时安装第三方插件。新增一个
provider 或 destination 应该主要涉及 adapter 实现、schema-backed manifest、fixtures、
测试、显式 registry 注册，以及必要的 console UI override。

每个第三方 adapter 使用独立目录模块，例如 `packages/destinations/src/feishu/index.ts`
或 `packages/providers/src/grafana/index.ts`，同目录放置 fixtures 和 adapter 自测。包根
`index.ts` 只做聚合导出；`package.json` 为每个 adapter 提供子路径导出，例如
`@tocsin/destinations/feishu` 和 `@tocsin/providers/grafana`。

集成目录内部也要保持职责拆分，避免把 schema、manifest、解析/发送逻辑和 payload 构造都塞进
`index.ts`。`index.ts` 只做 barrel export。推荐结构：

```txt
packages/destinations/src/<kind>/
  schema.ts       typed config schema
  manifest.ts     JSON-safe adapter manifest
  payload.ts      preview/wire payload rendering
  adapter.ts      Adapter.define wiring and send flow
  index.ts        public exports only

packages/providers/src/<provider>/
  schema.ts       typed config schema
  manifest.ts     JSON-safe provider manifest
  parse.ts        provider payload normalization
  adapter.ts      Adapter.define wiring
  index.ts        public exports only
```

跨集成复用的协议解析、severity/status 归一化、对象读取 helper 等放在 package 内的
`shared/` 模块，不能通过某个具体 adapter 的 `index.ts` 借道导入。具体 adapter 之间不应因为
复用 helper 形成依赖。

这套设计需要同时满足：

- 贡献者容易理解和编写。
- 接口足够小，但能表达配置、secret、安全摘要、错误分类和 UI catalog。
- `apps/console` 仍然拥有存储、认证、secret refs、配置导入导出、路由、投递重试和 UI 渲染。
- adapter package 不依赖 React、TanStack Form、SQLite、Better Auth、env 或 app container。

## Adapter 形态

公开 adapter API 使用各 package-local `utils.ts` 中的 `Adapter.define` identity helper，
不使用 abstract class。Adapter 是静态能力描述加纯函数行为，不是有生命周期的服务对象。
Provider 的 parse input/result 辅助逻辑放在 `ParseInput`、`ParseResult` 这类语义明确的
工具类里；Destination 的发送结果、transport helper 和模板引擎也放在 package-local helper
里，避免把行为 helper 混进 `*.types.ts`。

共享 manifest primitives 放在 `@tocsin/core`：

- 配置字段描述。
- secret 字段声明。
- client-safe catalog DTO。
- lifecycle status。
- config version。

这些 primitives 必须保持 JSON-safe 和可序列化，只包含 schema 与数据契约，不包含函数、class、
React component、RegExp、fetch、parse/send 或 transport context。

完整运行时接口留在对应 package：

- `@tocsin/providers` 暴露 `ProviderAdapter`。
- `@tocsin/destinations` 暴露 `DestinationAdapter`。
- `@tocsin/destinations/urgency` 暴露 `UrgencyChannelAdapter` 与 `UrgencyRegistry`（见下文 urgency 边界）。

Provider 和 destination 只共享 manifest primitives，不合并成一个万能
`IntegrationAdapter`。Provider 的核心动词是 `parse`，destination 的核心动词是
`preview` / `send`。

## Manifest 与 Console Catalog

Adapter manifest 是 TypeScript 对象，不是 YAML/TOML/JSON 配置文件。它和 Zod schema、
parse/send 函数、测试同源维护。TOML 与 JSON 使用同一份 Tocsin 用户配置快照和 schema；TOML
仍是首选 config-as-code 格式。

每个 adapter 必须显式声明 lifecycle status 和 `configVersion`。Lifecycle 不默认 stable；
`configVersion` 从 `1` 开始，只描述该 adapter config 的形状演进。

完整 adapter 只存在于服务端 registry。浏览器 UI 通过 oRPC procedure 获取 client-safe
adapter catalog DTO，只包含：

- kind/provider。
- i18n key。
- icon id/name。
- 可渲染配置字段。
- 公开能力。
- lifecycle status。

Catalog DTO 不包含 `parse`、`send`、Zod schema 对象、secret 内部规则或任何运行时代码。它也不返回完整 `secretFields`；客户端只通过 `configFields.sensitive` 获得表单所需的敏感字段语义。

Catalog capabilities 使用 provider/destination 各自的封闭结构，不使用开放
`record<string, boolean>`。

Urgency channel 没有 manifest 与 catalog 投影：它不渲染用户可见消息、没有需要在表单里渲染的配置
字段（配置形状挂在 destination config 上），因此只暴露 `kind` + `ping`。

## 配置与 Secret

Adapter runtime 只接收已经解析、已经校验的 typed config。`secretRefs`、env refs、TOML
解析、TOML/JSON 导入导出、缺失 secret 报错和未来 secret store 都属于 `apps/console` 配置边界。

配置字段使用安全 dot path，不支持数组下标、通配符或表达式。数组和 map 通过
`string-list`、`key-value` 等字段类型表达。

字段类型在 MVP 中封闭，不支持 adapter 自定义字段类型。复杂 UI 在 console feature module
中显式 override。

`AdapterConfigField` 使用 discriminated union。每种字段类型只暴露自己的属性集合，而不是使用
一个松散的大对象。

字段可以声明 `sensitive: true` 作为 UI 语义，用于不回显原值和触发 secret 三态编辑。服务端
安全边界仍由独立的 `secretFields` 声明决定。

`secretFields` 包含安全 dot path 和封闭 `kind` 分类，例如 `token`、`webhook_url`、
`signing_secret`、`password`、`api_key`、`endpoint_url`、`header`。该分类用于 env hint、
安全摘要和 redaction helper，不做自定义 redaction policy DSL。

`configSchema` 是运行时默认值的唯一真相。Manifest 的 `defaultValue` 只是 UI 初始化提示；
新增或调整默认值时，通过 adapter 自测或 catalog 投影测试覆盖。destinations registry 也提供
`audit()`（`packages/destinations/src/registry.ts`），默认 registry 的 manifest 与 config
schema 一致性由 `registry.test.ts` 强制。

持久化的 Source/Destination config 必须始终 schema-valid。UI 可以有本地草稿，但 SQLite
和可移植配置导入不保存 invalid draft。

长期目标是 config 更新采用完整 replacement。Secret 更新使用三态意图：

- `preserve`：保留旧值。
- `replace`：替换为新值。
- `clear`：清空该 secret。

## Provider 边界

Provider adapter 可以接收 typed Source config，用于 severity 映射、默认 labels、metadata
选择等解析行为。Webhook 认证由 console 服务层统一执行。

Provider manifest 可以声明认证需求或可选认证方式，例如 Source token、额外共享密钥、
未来 HMAC 签名等。Adapter 声明认证形态，console 负责表单、secret refs、认证执行和审计。

MVP 中 provider parse 每次返回单个规范化告警，对应一个入站 Webhook 形成的告警事件。包含
多个 alert item 的上游载荷先归并为单个 normalized event，并在 metadata 中记录
`alertCount`、group key 等信息。未来支持 batch fan-out 需要重新讨论 Event 语义、raw payload
归属、idempotency、delivery dedupe、route match 和 UI 详情模型。

Provider parse 的预期失败用结构化结果表达，异常只代表非预期 bug 或最后防线。

Provider parse result 使用 `ok` discriminated union。成功分支返回 normalized event、provider metadata
和 idempotency key；失败分支返回封闭 failure reason、安全消息和可选 metadata。只有认证通过且
Source enabled 的 parse failure 才记录 parser-failure Event。

Provider parse input 使用 `source: SourceSummary`、redacted headers、JSON-safe payload 和 typed
config。Raw headers 只供 console 认证层使用；provider adapter 也通过顶层 `configSchema` 自动
推断 config 类型。

## Destination 边界

Destination adapter 负责 preview 和 send，但不拥有 Delivery 状态转移、重试策略或队列调度。
Send result 返回标准错误分类和 retry hint，最终是否重试、何时重试由 console worker 决定。

Destination transport context 保持小而显式，先稳定 `fetch`、`now`、timeout、user agent 等通用能力。
Adapter 不能接收 app container、数据库、logger 或任意服务对象。

Preview 和 Delivery rendered payload 都是 safe debug representation，不承诺等于实际 wire
payload。真实 secret 只在 `send` 内部用于构造网络请求，不能进入 preview、测试结果、Delivery
详情或持久化 rendered payload。

MVP 不让 adapter manifest 控制 rate limit 或 concurrency。Delivery worker 先使用全局
batch/backoff 策略，per-destination policy 未来单独设计。

## Urgency channel 边界

（2026-10-10 落地，见 `docs/adr/0009-oncall-feishu-urgent.md` 决定 7 与 `docs/adr/0002` 的对应修订。）

出站"通知"与主动"呼叫人"是两种语义，因此 adapter 家族在 provider 与 destination 之外还有第三类：
`UrgencyChannelAdapter`（`kind` + `ping(input, ctx)`）与 `UrgencyRegistry`，落在
`packages/destinations/src/urgency/`。它复用 destination 的全部纪律——结构化 `ok` union、封闭 error
kind、retry hint、只接收已校验 typed config、不碰 DB/container/logger、`fetch` 与 `now` 由 ctx 注入——
但**没有 manifest / catalog / preview**：加急渠道不渲染用户消息，也没有需要进 UI 的配置字段，
配置形状挂在 destination config（`urgent` 块）上，由 destination schema 负责校验。

`UrgencyChannelKind` 是与 `DestinationKind` 并列的封闭枚举，v1 唯一成员 `feishu_urgent_phone`。
输入是 `{ app: { appId, appSecret }, messageId, receivers, userIdType }`：`messageId` 指向一条**已由
destination 发送**的消息（delivery 的 provider reference），渠道只升级它、自己不发消息。

重试判定复用 destination 的同一张平台错误码表（`shared/feishu-errors.ts`）：限流与暂时性拒绝为
`retryable`，配置/权限/额度类为 `not_retryable`，凭证失效在渠道内部先重换 token 再决定。渠道返回的
`retryHint` 只是建议，最终退避与状态转移仍由 console 的 oncall worker 拥有——与"adapter 表达语义、
worker 拥有策略"的既有分工一致。

## Destination 模板扩展

`messageTemplate` 已由 Destination config 内联的 `template` 模型替代，不做迁移兼容。模板仍然只
允许安全、确定性的变量插值，不执行用户提供的 JavaScript、表达式、SQL、shell 或任意动态代码。

共享模板模型、渲染器和诊断能力已覆盖下列模式（2026-10-18 核实；四种模式的联合定义见
`packages/destinations/src/template.ts`）：

- Feishu：支持文本消息和交互式卡片，卡片结构需要 adapter 级 schema 校验与预览。
- Slack：支持普通文本和 Block Kit 风格的结构化消息。
- Email：支持文本正文、HTML 正文、主题模板，以及安全的 HTML 转义边界。
- Generic webhook：支持可校验的 JSON payload 模板，而不仅是 `message` 字段。

Feishu 内置卡片使用稳定引用而不是在 Destination config 中复制完整 JSON：

```json
{
  "source": "builtin",
  "id": "feishu.alert-card",
  "version": 1,
  "bindings": {}
}
```

`id + version` 由 destination adapter 解析为受版本控制的内置模板。用户开始编辑卡片或文本后，
配置显式切换为 `source: "custom"` 并保存完整模板内容；系统不自动翻译或覆盖自定义文案。旧版把
内置卡片 JSON 直接写入配置的记录不做兼容迁移，按自定义模板解析。preview/send 渲染路径只消费
版本化内置模板引用或自定义模板，不通过整份 JSON 比较决定渲染语言。

模板 i18n 使用显式 presentation context。Console 的 preview service 与 Delivery worker 从 Settings
读取 `locale + timeZone` 后传入 destination render input，destination 包不读取数据库、request context
或 Console i18n runtime。模板同时保留稳定机器值和本地化展示值，例如 `event.status` 与
`event.statusDisplay`、`event.occurredAt` 与 `event.occurredAtDisplay`；受白名单约束的
`presentation.labels.*` 提供内置模板和示例模板所需的系统文案。内置模板因此只维护一份结构，
并在发送时按实例语言和时区渲染。

扩展设计应满足这些约束：

- 模板仍然是安全解释执行，不引入用户 JavaScript、远程代码、shell、SQL 或不受控表达式求值。
- 模板输入仍以 normalized event、Source summary、Destination summary 和安全上下文为主；同时允许通过
  `payload.*` 路径读取递归脱敏后的 provider payload 标量叶子，便于展示 provider-specific 信息。对象、
  数组、null、缺失路径渲染为空字符串，raw headers、destination secrets、source token 和未脱敏 payload
  永不进入模板上下文。
- Preview、test result 和 Delivery `renderedPayload` 继续只保存 secret-safe debug representation；
  真实 wire payload 可以由 adapter 在 `send` 内部追加签名、鉴权字段或平台特定 envelope。
- Adapter manifest/catalog 需要表达模板能力，例如支持的模式、字段、默认模板、预览能力和是否需要
  console UI override。
- TOML/JSON import/export 需要能表示结构化模板，并保持 secret 与模板内容的边界清晰。
- UI 应为不同 destination 展示对应的模板编辑体验，例如飞书卡片 JSON/表单预览、Slack blocks
  预览、Email HTML 预览；复杂交互留在 `features/destinations` 的 adapter-specific override 中。

待定问题：

- 文本模板、结构化 JSON 模板、平台原生卡片/blocks schema 之间是否共享一套变量语法。
- 是否需要模板版本号和按 adapter `configVersion` 绑定的兼容策略。
- 结构化模板校验失败时，Delivery 是失败、回退文本模板，还是在保存配置时就禁止启用。

## 路由与 Metadata

路由规则只匹配 Source、severity、status、labels、title 和 message。它不匹配
`providerMetadata` 或 raw payload。需要参与路由的 provider-specific 信息必须提升为 label
或未来明确扩展 normalized field。

Provider metadata 由 adapter 产出，但 console 在入库前统一脱敏兜底。Adapter 不应把 secret、
认证 header、完整敏感 URL 或 raw auth config 放入 metadata。

Labels 表达可路由上下文，优先使用 `service`、`environment`、`cluster`、`namespace`、
`team` 等稳定短 key。`environment` 是 Tocsin 的 canonical 环境标签。高基数字段、trace/request
id、时间戳、完整 URL 和错误堆栈不默认进入 labels。

## Registry 与测试

默认 adapter 使用显式集中注册，不做文件系统自动发现或 glob import。集中注册文件是默认支持
清单。

新增 adapter 的最低测试契约：

- Adapter 自测。
- 默认 registry 注册和 client-safe catalog 投影测试。
- 只有新增字段类型、form override、secret ref 行为或特殊 preview/test 行为时，才增加 console
  集成测试。

Catalog 投影测试应覆盖默认支持的 kind 列表，以及 client-safe catalog 不含函数、schema、
secret internals。

Registry 可以暴露 `get`/`list` 供服务端编排使用，但业务路径优先依赖 `parse`、`send`、
`preview`、`parseConfig`、`toCatalog` 等窄方法。Client-safe catalog projection 由 registry/package
提供，console service 只做认证和 app-level 包装。

注册阶段校验硬性 manifest 不变量并在代码错误时 throw。Destination registry 现与 provider 对齐，
提供可复用的 `audit()`（kind 枚举与 registry 一致、`sensitive` 与 `secretFields` 对齐、manifest
message key 存在、catalog 不含运行时内部、`defaultValue` 与 schema 默认值一致）；它由测试强制通过，
生产启动不因为 soft warning 阻塞。新增 destination adapter 的操作步骤、注册点清单与已知摩擦见
`docs/contributing/destination-adapter.md`。

## 落地顺序

## 接口草案补充

Core 的 catalog item 用泛型 kind，具体 provider/destination package 再收窄到封闭枚举。字段
path 使用安全 dot path schema 与字段定义测试约束，不做从 config schema 推导 dot path
的复杂 TypeScript 类型。

Destination send result 使用 `ok` discriminated union。失败分支必须包含 error kind、retry hint
和安全错误消息；`statusCode` 与已脱敏 `responseBody` 是通用 nullable 字段。脱敏覆盖敏感键
与高置信值形态（认证 scheme、URL userinfo、Slack/飞书 webhook URL），不承诺覆盖无前缀裸
token 或 generic webhook path/query 中的 secret。

Send result 始终携带 safe `renderedPayload`，用于 preview 和 Delivery detail，不承诺等于实际
wire payload。Adapter 捕获预期 transport 失败并返回结构化 failure；worker catch 只兜底非预期
adapter bug。

Transport context 中的 `fetch` 由 console/container 提供为策略化 wrapper，统一处理 timeout、
user agent、未来 proxy/network policy 和测试 fake。Adapter 使用该 wrapper，不各自实现全局
timeout 策略。

`Adapter.define` 从顶层 `configSchema` 推断 typed config。Adapter 对象用
`manifest: { ... }` 承载 JSON-safe 静态描述，`configSchema`、`preview` 和 `send` 放在
manifest 外。完整 manifest 可包含 `secretFields`，但 client catalog projection 必须移除它。

Provider adapter 同样使用 `Adapter.define`。Standalone parser 入口只用于 adapter 自测和
package 级便利 API，使用 `ParseInput.fromStandalone` 补全 `SourceSummary`，并通过
`ParseResult.unwrap` 把结构化 parse result 转换为旧的 throwing convenience API。

Destination `preview` 和 `send` 共享同一个 render input。`preview` 不接收 transport context，
只返回 safe `JsonValue`；console service 负责包装成 UI DTO。

采用分阶段 tracer bullet：

1. 在 `@tocsin/core` 建 manifest primitives。
2. 选择一个 destination adapter 打通 `Adapter.define`、字段描述、secret 声明、
   config version、结构化错误、retry hint、transport context 和 registry/catalog 投影测试。
3. 将每个第三方 adapter 迁移为目录模块，并暴露 package 子路径导出。
4. 增加 console catalog oRPC procedure（contract + `server/orpc/features/<capability>/router.ts`）。
5. 迁移剩余 destinations。
6. 迁移 providers。
7. 最后逐步替换为 manifest-driven 表单渲染，复杂交互保留 feature override。
