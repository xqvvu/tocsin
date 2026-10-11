# Destination 模板扩展采用对象根 payload 与变量级 HTML 转义

状态：接受（2026-10-11）。对应 PR #42（generic webhook `json_payload`）、#43（Slack `slack_blocks`）、
#46（`slack_blocks` 绑定链路与 manifest/i18n 对齐守卫）、#48（Email `subjectTemplate` / `htmlTemplate`）。
本 ADR 承接 `docs/prd/destination-template-follow-up-review.md`（#16 评审）给出的四条待记录决策：模式分派、
JSON 模板根类型、多模板槽建模、HTML 输出编码。模板语言与安全变量面本身由
`docs/prd/destination-template-engine.md`、`docs/adr/0005-destination-template-dynamic-bindings.md` 和
`docs/adr/0006-redacted-payload-template-context.md` 定义，本 ADR 不改动它们。

## 背景

Feishu 落地之后，共享模板引擎只有两种模式：`text`（字段 `text`）与 `feishu_card`（字段 `card`）。
`DestinationTemplateSchema` 是这两种模式的判别联合，`packages/destinations/src/feishu/schema.ts` 直接把它
当作自己的模板类型使用。#16 评审确认了三件事：渲染器（`interpolateJsonTemplate`）、诊断（
`diagnoseJsonTemplate`）和 `TemplateContext v1` 足以复用；真正的决策点是**新模式挂在哪、根类型怎么定、
一个通道需要多个模板槽时怎么建模、HTML 输出如何转义**。

两个具体的形状冲突：

- Slack Block Kit 的主体是一个数组。而 destination config、TOML/JSON 导出和 `JsonObjectSchema` 都以对象为根，
  模板字段若接受顶层数组就要求放宽核心 schema。
- Email 一个通道需要三份内容（subject、text body、html body）和三种输出语境。共享联合类型是
  「一个 `template` 字段 + mode 判别」，无法表达多槽；而把三槽打包成一个 mode 会让 Email 的形状进入共享模型。

同时，`diagnoseDestinationTemplate` 当时用 `template.mode === "text" ? 文本诊断 : 卡片诊断` 的三元表达式
分派——只有两种模式时正确，第三种模式出现后会把所有非 text 模式一律读到 `.card`。

## 决定

1. **`json_payload` 与 `slack_blocks` 都用 `payload` 字段，且都是对象根。** 两个模式的模板字段类型都是
   `packages/core/src/json.ts` 的 `JsonObjectSchema`（`z.record(z.string(), JsonValueSchema)`），
   因此顶层数组被拒绝这一点保持不动。Slack 的 webhook body 本身就是对象
   （`{ text?, blocks: [...] }`），blocks 数组放进 `payload.blocks` 即可，
   `slack/payload.ts` 的 `renderSlackPayload` 在 `mode === "slack_blocks"` 时把渲染结果整个作为出站 body。
   也就是说对象包装不是妥协，而是与平台契约同形：`slack_blocks` 与 `json_payload` 表达的是同一件事——
   运算符拥有出站 JSON 的根对象。共用字段名让两种模式复用同一条诊断分支和同一个
   `template.payload.*` 诊断路径前缀，`json_payload` 在 `generic-webhook/payload.ts` 里同样替换整个默认 envelope。
2. **模式分派改为穷尽 `switch`。** `DestinationTemplateEngine.diagnoseDestinationTemplate`
   现在对 `template.mode` 做穷尽 `switch`，每个分支读自己的字段：`text → .text`、`feishu_card → .card`、
   `json_payload` 与 `slack_blocks` 合并一条 `→ .payload` 分支。共享联合类型扩张后，遗漏分支会让
   函数在 `strict` 下失去穷尽性（TS2366：函数缺少结尾 return，返回类型不含 `undefined`——已用一个最小
   复现验证），新增模式必须显式登记自己怎么诊断，而不是被三元表达式的 else 分支默默接走。
3. **`DestinationTemplateSchema` 是「引擎会诊断」的全量联合，各通道自己收窄。** Feishu 在
   `feishu/schema.ts` 用 `FeishuCustomDestinationTemplateSchema`（只列 `text` 与 `feishu_card`）而不是全量联合；
   Slack 用 `SlackTemplateSchema`（`text` / `slack_blocks`），generic webhook 用
   `GenericWebhookTemplateSchema`（`text` / `json_payload`），Email 只接受
   `TextOnlyDestinationTemplateSchema`。
   manifest 侧同样按通道声明 `modes`（`feishu/manifest.ts`、`slack/manifest.ts`、
   `generic-webhook/manifest.ts`），`registry.test.ts` 断言 Slack 声明的 `modes` 就是 Slack 真能渲染的
   那两种。收窄的意义是：共享联合类型增长不会让某个通道多出它渲染不了的模式——渲染不了的模式若能
   保存，就是静默的投递故障。
4. **Email 的多模板槽用 adapter-local 平级字段建模。** `subjectTemplate` 和 `htmlTemplate` 是
   `email/schema.ts` 中与 `template` 平级的可选文本字段（同 `EmailTemplateTextSchema`，trim 后 1–4000），
   **不是新模式**。`subjectTemplate` 一旦设置就拥有整行主题，`subjectPrefix` 随之失效；未设置时主题与
   今天逐字节一致。`htmlTemplate` 取代自动生成的 `<pre>` 正文。两者都靠 `EmailConfigSchema` 自己的
   `superRefine` 调用 `DestinationTemplateEngine.diagnoseTextTemplate` 诊断——`diagnoseConfig` 只读
   `config.template`，少了这步未知变量会渲染成空串并照常投递。绑定沿用 `template.bindings`
   （`email/payload.ts` 的 `renderEmailSubject` / `renderEmailHtml` 都传 `config.template?.bindings`）。
5. **HTML 语义是「变量值转义、模板标记可信」，且不提供原文退出。** 共享 `renderText` / `renderTextOrThrow`
   新增可选的第 5 个参数 `TemplateRenderOptions`，只有一个成员 `escape?: (value: string) => string`。
   该钩子位于 `interpolateTemplateString` 的 `replaceAll` replacer 内部，只对 `templateValue` 解析出来的
   变量值生效，模板自身的字面文本按原样输出。因此运算符可以手写 `<table>` 等结构，而
   `{{event.title}}` 携带 `<script>` 时落到 HTML 里是实体化后的惰性文本。默认不传钩子，
   未使用的通道渲染结果逐字节不变。`escapeHtml`（`& < > " '`）留在 email 模块，只是从私有改为导出，
   `@tocsin/core` 未改动。不存在 `raw.` 之类的可信原文前缀。

## 后果

- 四种模式共用同一渲染器、同一诊断形状、同一 `TemplateContext v1`；安全变量面没有扩张，
  `{{config.webhookUrl}}`、`{{headers.authorization}}` 一类引用仍是带路径的 error 诊断
  （`apps/console/src/server/configuration/configuration.integration.test.ts` 的 Slack blocks 用例覆盖了
  这两条诊断路径，并断言 preview 全树不含 webhook URL 的路径段）。
- 模板校验失败继续映射为 `configuration_error` + `not_retryable`，且不发请求；四个通道的 adapter
  在这一点上形状一致（`zodTemplateDiagnostics` + `TemplateValidationError` catch）。
- 已有的 `text` 模板、Feishu 卡片模板和 Email 主题/正文行为不变；无需迁移任何已保存配置。
- `slack_blocks` 与 `json_payload` 目前只能经 config JSON / API / TOML 配置：console 表单对
  非 Feishu 通道仍渲染单个 textarea（`destination-form.tsx` 的 `renderTemplateFields`），
  `DestinationTemplateFormMode` 也只有 `"text" | "feishu_card"`。Email 的两个新字段同样没有表单输入项。
  缺口由 https://github.com/xqvvu/vane/issues/47 跟踪，PR #46 的 manifest 守卫只保证「声明出来的模式
  确实能渲染」，不保证能被选择。
- 想发顶层数组的通道必须自己找对象键位。Slack 天然有对象；若将来出现确实需要数组根的平台契约，
  要重开的是「核心 JSON 根类型」这条决策，而不是在 adapter 里偷偷放宽。
- 反向的代价是 `payload` 这个字段名在两个不相关的模式里含义相近但不共享 schema：
  `SlackBlocksDestinationTemplateSchema` 与 `JsonPayloadDestinationTemplateSchema` 是两个独立定义，
  未来若两者约束分叉（例如 Slack 侧要求存在 `blocks` 键），需要各自演进，不能假设改一处即可。
- HTML 转义只覆盖变量值，不校验运算符手写的标记本身。Tocsin 的定位是运算符自配置、
  收件人是他自己团队的值班成员，这层信任与 JSON 模板里「卡片结构由运算符编写」是同一个假设；
  一旦通知需要接受不可信第三方编写的模板，就必须重开本决策第 5 条。

## 不采用的方案

### 为 Slack 放宽 `JsonObjectSchema` 接受数组根

即 #16 评审里的方案 B。对象根不是历史包袱：destination config 本身就是对象（
`packages/core/src/json.ts` 的 `JsonObjectSchema`），TOML/JSON 导出的 `config` 字段同样按对象处理
（`packages/core/src/config.ts` 的 `TomlDestinationDocumentSchema`），敏感字段剔除与 secret ref 解析都
按对象路径遍历。为一个通道放宽核心 schema 会把成本转嫁给所有目的地与所有可移植配置。而 Slack 的
webhook body 本来就是对象，数组根在平台侧也没有收益。

### 把模式分派改成模式表 / 策略对象

#16 评审建议表驱动。实现选了穷尽 `switch`：模式数量是个位数、每个模式只有一行分派逻辑，表驱动
换不来额外的信息。能保持同样约束的写法是 `Record<DestinationTemplateMode, strategy>` 这类完整映射，
但更常见的查表带默认分支，那正是原三元表达式犯过的错——把没登记的模式交给别人的字段。`switch`
把「必须登记」直接变成类型层约束，不需要额外维护一张表和它的一致性。

### 用 `email_composite` 打包模式表达 Email 三槽

Email 的一个通道形状会泄漏进共享判别联合，其他通道要么被迫兼容它，要么在引擎里长出「某些模式只在某些
kind 合法」的隐式规则。平级字段把形状留在 `email/schema.ts`，共用的是渲染与诊断入口，不是模式定义。

### 给 HTML 提供 `raw.` / 可信原文退出

`raw` 命名空间在引擎里本就被拒绝。为 HTML 单开一个「这个值不要转义」的口子等于把注入面重新交给
变量值，而变量值恰恰来自上游 provider 的 payload 与告警文本。需要富文本时应改用结构化 JSON 模板。

### 把 `escapeHtml` 提升到 `@tocsin/core`

#16 评审把提升位置列为未解决项。实现按最小面处理：目前只有 email 需要 HTML 语境，共享层只接
`escape` 钩子（一个函数类型），实体表留在通道内。等第二个 HTML 语境通道出现再提升，避免把一份
未经第二方验证的实体表变成核心 API。

## 相关文档

- `docs/prd/destination-template-engine.md`（「模板模式全貌」一节是四种模式与 Email 平级字段的当前清单）
- `docs/prd/destination-template-follow-up-review.md`（#16 评审，本 ADR 记录它建议的四条决策）
- `docs/adr/0005-destination-template-dynamic-bindings.md`（`bindings` 在四种模式下如何解析）
- `docs/adr/0006-redacted-payload-template-context.md`（`payload.*` 变量语义，与模板字段 `payload` 无关）
- `docs/adr/0002-curated-adapter-extension-model.md`（manifest 声明能力、console 按 manifest 渲染）
- `packages/destinations/src/template.ts`（模式定义与 `diagnoseDestinationTemplate` 分派）
- `packages/destinations/src/email/payload.ts`（`escapeHtml` 与两个平级字段的接线）
