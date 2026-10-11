# PRD: Destination 结构化模板引擎

Labels: `ready-for-agent`

## Problem Statement

Tocsin 的 MVP 已经支持 Destination message template，但当前能力本质上是文本插值。它可以覆盖飞书文本消息、Slack 正文、Email 文本正文和 generic webhook 的 `message` 字段，却无法表达飞书交互式卡片、Slack blocks、Email HTML 或通用 webhook 的结构化 JSON payload。

SRE 用户配置告警通知时，不只需要“把标题和消息拼成一段文本”，还需要按团队通知规范组织结构化消息：突出 severity/status、展示关键 labels、链接回 Tocsin Event detail，并在飞书卡片或后续 Slack blocks 中形成可读、可预览、可测试的消息。

同时，模板配置必须保持 Tocsin 的安全边界：不能执行用户 JavaScript、shell、SQL 或动态代码；不能把 source token、destination secret、raw sensitive payload 或 webhook URL 暴露到浏览器、TOML 默认导出、Delivery rendered payload 或普通日志中。

## Solution

引入 Destination-aware 的结构化模板引擎。模板仍然作为 Destination config 的一部分，不引入独立 Template 资源。

本轮实现共享模板基础设施，并以 Feishu 作为首个落地 Destination：

- Feishu 支持 `text` 与 `feishu_card` 两种模板模式。Slack、Email 和 generic webhook 由后续切片继续扩展，
  当前共四种模板模式，完整清单见下面的「模板模式全貌」。
- `messageTemplate` 被 `template` 完全替代，不做迁移兼容。
- 模板语言只支持安全路径插值，不支持条件、循环、表达式、函数调用或默认值表达式。
- 模板支持受控动态绑定（`bindings`）：从一个允许的低基数标量字段选择字符串值，再通过
  `{{bindings.<name>}}` 插入同一份模板中的局部属性。
- 结构化 JSON 模板递归遍历字符串字段并做变量插值。
- 模板保存前必须通过 mode、基础结构、变量路径、大小和长度校验。
- Preview 返回 rendered payload、safe template context、diagnostics，并可用内置样例 Event 或历史 Event 作为样本。
- UI 为模板编辑提供变量参考、样例事件、normalized fields、redacted raw payload reference、rendered payload 和错误定位。

第一版不做飞书卡片拖拽设计器。用户直接编辑卡片 JSON/template，并通过 preview/test 验证平台是否接受。

## 模板模式全貌（当前实现）

共享引擎目前声明四种模板模式，定义在 `packages/destinations/src/template.ts`
（`DestinationTemplateSchema`）。每个模式的模板字段名不同：

| 模式 | 模板字段 | 字段类型 | 适用通道 | 渲染结果 |
| --- | --- | --- | --- | --- |
| `text` | `text` | 字符串（trim 后 1–4000） | Feishu、Slack、Email、generic webhook | 文本插值；Feishu 作 `msg_type: "text"` 正文，Slack 填默认 blocks 的 `section.text`，Email 作文本正文，generic webhook 填默认 envelope 的 `message` |
| `feishu_card` | `card` | `JsonObjectSchema` | 仅 Feishu | 递归插值卡片 JSON 的字符串叶子，发送为 `{ msg_type: "interactive", card }` |
| `json_payload` | `payload` | `JsonObjectSchema` | 仅 generic webhook | 替换整个默认 envelope，运算符拥有出站 JSON 形状 |
| `slack_blocks` | `payload` | `JsonObjectSchema` | 仅 Slack | 替换整个 Slack webhook body；blocks 数组放在对象里（`{ text?, blocks: [...] }`），不是顶层数组 |

关于这张表的实现事实：

- `json_payload` 与 `slack_blocks` 共用 `payload` 字段名和同一条诊断分派分支，但属于两个互不相干的模式，
  各自只在自己的通道 config schema 里可选：`GenericWebhookTemplateSchema`（text / json_payload）、
  `SlackTemplateSchema`（text / slack_blocks）。Feishu 收窄为 text / `feishu_card`，不会因为共享联合类型
  扩张而多出可选模式。取舍见 `docs/adr/0010-destination-template-object-root-payload-and-html-escaping.md`。
- 三种 JSON 模式的根都是对象：`packages/core/src/json.ts` 的 `JsonObjectSchema` 是
  `z.record(z.string(), JsonValueSchema)`，拒绝顶层数组。
- `bindings`（受控动态绑定）是四种模式共同的可选字段，见 `docs/adr/0005-destination-template-dynamic-bindings.md`。
- Feishu、Slack 和 generic webhook 的 `manifest.ts` 用 `type: "template"` 字段的 `modes` 数组声明该通道
  可渲染的模式，console catalog 从这里读取；`registry.test.ts` 断言 Slack 的 `modes` 与 Slack 真实可渲染的
  模式一致。Email 的 template 字段只有文本模式，因此没有声明 `modes`。
- Feishu 另有一条不属于模式清单的路径：`source: "builtin"` 的版本化内置卡片引用
  （`BuiltInFeishuDestinationTemplateSchema`），由 adapter 解析成卡片 JSON 后走同一渲染入口。

Email 没有新增模式，而是增加两个与 `template` **平级**的文本字段（不是模式）：

| 字段 | 类型 | 语义 |
| --- | --- | --- |
| `subjectTemplate` | 字符串（trim 后 1–4000，可选） | 设置后整行主题由该模板拥有，`subjectPrefix` 随之失效；未设置时保持内置 `[severity status] title` |
| `htmlTemplate` | 字符串（trim 后 1–4000，可选） | 取代自动生成的 `<pre>` HTML 正文；运算符手写的 HTML 标记按原样输出，每个变量值经 `escapeHtml` 转义 |

HTML 转义语义与「不提供 raw / 可信原文退出开关」的边界见
`docs/adr/0010-destination-template-object-root-payload-and-html-escaping.md`。

已知限制（截至本文档更新时）：console 的 Destination 表单只对 Feishu 渲染模式选择器，
`slack_blocks` 与 `json_payload` 还不能在表单里选择，Email 的 `subjectTemplate` / `htmlTemplate`
也没有表单输入项。这些模式与字段已经通过 schema、渲染、诊断、preview、test 和 delivery 全链路实现，
可以用 config JSON / API / TOML 配置；表单侧的缺口由 https://github.com/xqvvu/vane/issues/47 跟踪。

## User Stories

1. As an SRE, I want a Destination to have a structured template config, so that message formatting is owned by the Destination that sends it.
2. As an SRE, I want Feishu Destinations to choose between text and card templates, so that simple teams can keep text while advanced teams can use cards.
3. As an SRE, I want Feishu card templates to use Feishu-native card JSON, so that I can copy patterns from Feishu documentation without learning a Tocsin-specific card DSL.
4. As an SRE, I want template strings to interpolate normalized alert fields, so that notification content can include title, message, severity, status, fingerprint, labels, and occurred time.
5. As an SRE, I want template strings to interpolate Source and Destination summaries, so that notifications can show where an alert came from and where it was sent.
6. As an SRE, I want a safe Tocsin Event URL variable, so that notification cards can link back to the Event detail page.
7. As an SRE, I want the template editor to show all available variables, so that I do not need to guess field names.
8. As an SRE, I want each variable to show example values, so that I can understand what will appear in the notification.
9. As an SRE, I want to click a variable to insert it into the template, so that template authoring is less error-prone.
10. As an SRE, I want to preview templates with a built-in sample Event, so that I can configure a Destination before real Events exist.
11. As an SRE, I want to preview templates with a recent historical Event, so that I can test formatting against real SigNoz, Grafana, Uptime Kuma, Alertmanager, or generic payloads.
12. As an SRE, I want the preview to show normalized Event fields, so that I can understand the stable data available to templates.
13. As an SRE, I want the preview to show redacted raw payload reference, so that I can understand what the upstream system sent.
14. As an SRE, I want templates to reference scalar fields from the redacted provider payload, so that provider-specific details can be rendered without every adapter promoting them into normalized labels.
15. As an SRE, I want unknown template variables to fail validation before save, so that broken templates do not create broken Deliveries later.
16. As an SRE, I want template errors to identify the JSON path where they occur, so that I can fix card templates quickly.
17. As an SRE, I want the rendered payload preview to omit Feishu signing fields, so that previews remain secret-safe.
18. As an SRE, I want Destination test to use the same renderer as real delivery, so that a successful test means the saved template and credentials work together.
19. As an SRE, I want Feishu platform rejection to be recorded separately from local template validation failure, so that I know whether Tocsin or Feishu rejected the message.
20. As an SRE, I want template rendering failures during Delivery to be non-retryable configuration errors, so that the worker does not waste retries on invalid config.
21. As an SRE, I want TOML import/export to use the new `template` shape, so that portable config represents the actual destination message format.
22. As an SRE, I want `messageTemplate` removed from new config, so that there is a single template model.
23. As an open-source contributor, I want shared template renderer and diagnostics primitives, so that future Slack blocks, Email HTML, and generic JSON templates can reuse the same safety model.
24. As an open-source contributor, I want adapter manifests to declare template modes and defaults, so that the console can render the right editing experience without adapter runtime internals.
25. As a security-conscious operator, I want templates to avoid user code execution, so that Tocsin does not become a remote code execution surface.
26. As a security-conscious operator, I want source tokens, destination secrets, raw sensitive headers, and webhook URLs excluded from template context, so that notifications cannot leak secrets.
27. As a maintainer, I want templates to remain Destination config JSON, so that this feature does not introduce new persistence relations before reuse is proven.
28. As an SRE, I want one Destination template to map `event.status` to platform-specific colors, so that firing and resolved notifications are visually distinct without maintaining duplicate templates.
29. As an SRE, I want new Feishu card Destinations to use red for firing, green for resolved, and grey for unknown by default, so that the common status-color behavior requires no setup.
30. As an SRE, I want to customize a dynamic binding through a compact mapping editor, so that I do not need to edit binding JSON by hand.
31. As an SRE, I want every dynamic binding to have an explicit fallback, so that previously unseen selector values render deterministically.
32. As an SRE, I want preview to exercise each configured selector case and its fallback, so that dynamic local properties can be reviewed before save or delivery.
33. As an SRE, I want existing customized Feishu cards to remain unchanged until I explicitly apply dynamic status colors, so that an upgrade does not silently rewrite notification appearance.
34. As a maintainer, I want dynamic bindings to remain shared destination template infrastructure while Feishu is the first UI integration, so that later destination modes can reuse the safety model without expanding this delivery scope.
35. As a security-conscious operator, I want bindings to select only approved scalar fields and return literal strings, so that dynamic styling does not introduce executable conditions or a workflow DSL.

## Implementation Decisions

- Destination templates remain adapter-owned config data stored in the existing Destination config JSON.
- No Template table, Template list page, reusable template library, or new persistence relation is introduced.
- `template` completely replaces `messageTemplate`. This is allowed because Tocsin has not reached a stable public release.
- No migration compatibility is required for old `messageTemplate` config.
- TOML import/export accepts and emits `template`, not `messageTemplate`.
- Adapter rendering must read `template` only.
- New Destination creation should write an explicit `template` using the adapter default.
- Adapter defaults may be used as server-side fallback for incomplete drafts or tests, but persisted config should be explicit.
- The first implementation includes shared template model, renderer, diagnostics, and Feishu `text` / `feishu_card` modes.
- Slack, Email, and generic webhook may receive minimal `template.mode = "text"` compatibility, but Slack blocks, Email HTML, and generic JSON editor are out of this first implementation.（这三项已由后续切片交付：
  `slack_blocks`、`json_payload` 模式与 Email 的 `subjectTemplate` / `htmlTemplate` 字段，见「模板模式全貌」）
- Feishu card templates use Feishu-native card JSON. Tocsin does not define a neutral card abstraction.
- Tocsin validates template safety and basic payload shape, but does not attempt to fully mirror the upstream platform's card schema.
- Destination test remains the authoritative integration check for platform-specific acceptance.
- Feishu `feishu_card` wire payload is `{ msg_type: "interactive", card }`.
- Feishu preview/rendered payload must omit `timestamp`, `sign`, webhook URL, and sign secret.
- Template language supports path interpolation only, using `{{event.title}}` style variables.
- Template language does not support expressions, function calls, conditionals, loops, default-value expressions, JavaScript, shell, SQL, or dynamic code.
- A template may declare a `bindings` record. Each binding has exactly one `select` path, a non-empty
  `cases` string map, and a required string `fallback`.
- Binding names must be safe path segments and are referenced as `{{bindings.<name>}}`.
- Binding resolution happens before ordinary template interpolation. A matching case returns its literal string;
  an unmatched selector value returns `fallback`. Case values and fallbacks are not recursively evaluated as
  templates.
- Template bindings may select only `event.status`, `event.severity`, `source.provider`, or
  `destination.kind` in the first version. Arbitrary `event.labels.*` selectors are out of scope.
- Bindings may only produce bounded strings. They cannot produce JSON objects, arrays, booleans, numbers, null,
  template fragments, or changes to template structure.
- Unknown binding references, invalid selector paths, missing fallbacks, invalid binding names, and invalid
  adapter-specific values are save-blocking diagnostics. Declared but unused bindings produce warnings.
- Adapter-specific schema may further restrict binding outputs used for platform fields. Feishu color controls
  expose only Feishu-supported color values even though the shared binding engine operates on strings.
- JSON templates are rendered by recursively interpolating string values only.
- 三种 JSON 模板（`feishu_card`、`json_payload`、`slack_blocks`）共用对象根与递归字符串叶子插值；
  `json_payload` 与 `slack_blocks` 还把模板放在同一个 `payload` 字段下，诊断路径统一为
  `template.payload.*`。
- 通道 config 只列出自己能渲染的模式：`DestinationTemplateSchema` 是共享引擎的全量联合，各通道用
  adapter-local schema 收窄，不直接暴露全量联合。
- `renderText` / `renderTextOrThrow` 接受可选的 `escape` 输出编码钩子。钩子位于插值替换函数内部，
  只作用于解析后的变量值；默认关闭，因此未传钩子的通道渲染结果逐字节不变。
- Email 的多模板槽用 adapter-local 平级字段建模（`subjectTemplate`、`htmlTemplate`），不引入
  `email_composite` 这类打包模式：一个通道的形状不进共享联合类型。这两个字段不在
  `DestinationTemplateEngine.diagnoseConfig` 的覆盖范围内（它只读 `config.template`），改由
  `EmailConfigSchema` 自己的 `superRefine` 调用 `diagnoseTextTemplate` 诊断。
- Unknown variables fail validation before save.
- Missing allowed label values render as empty strings.
- Template context v1 includes safe Event, Source, Destination, Tocsin link fields, and the recursively redacted provider payload under `payload`.
- Payload variables use scalar paths such as `{{payload.monitor.name}}`, `{{payload.heartbeat.ping}}`, or `{{payload.items[0].value}}`. Keys that contain dots or other special characters use JSON-style access such as `{{payload.commonLabels["threshold.name"]}}`. Missing paths and object, array, or null values render as an empty string.
- Payload interpolation is intentionally provider-specific and may break when an upstream provider changes its payload shape. Normalized Event fields remain the stable choice for common alert semantics.
- Template context v1 does not include raw headers, source token, destination config, destination secret, route internals, delivery attempt state, last errors, or any unredacted payload value.
- `event.id` maps to the current render input Event id.
- `tocsin.eventUrl` is generated by the console/server runtime and passed into rendering context. Destination adapters do not generate dashboard URLs.
- If a safe Tocsin URL cannot be generated, `tocsin.eventUrl` renders as an empty string.
- Historical payload is available in preview as redacted reference data and as the `payload` template context. Preview and real Delivery use the same recursively redacted payload projection.
- Preview supports an internal sample Event and may support a selected historical Event through `sampleEventId`.
- Historical Event samples are dashboard-authenticated and return only safe normalized data plus redacted raw payload reference.
- Historical Event sample selection is not required to prove that the current Destination would receive that Event through Routes.
- Preview returns structured diagnostics, not only thrown string errors.
- Template validation errors at save time reject create/update.
- Runtime template failures become `configuration_error` with `retryHint = "not_retryable"`.
- Feishu platform rejection remains `target_rejected` or existing HTTP classification, separate from local template validation.
- The default Feishu card persists a `statusColor` binding with `firing -> red`, `resolved -> green`,
  `unknown -> grey`, and `fallback -> grey`; the card header references
  `{{bindings.statusColor}}` instead of hard-coding `red`.
- Dynamic bindings belong to Destination template config, not Source or Route config. A Source does not own
  separate firing and resolved templates.
- Shared binding parsing, validation, diagnostics, and rendering live in `@tocsin/destinations`. The first product
  slice exposes dynamic-property controls only for Feishu card templates; Slack, Email, and generic webhook UI
  remain unchanged.
- The Feishu template editor includes a compact dynamic-property section with a selector control, case mappings,
  adapter-aware value controls such as color swatches, and a fallback. This is not a general rule builder.
- Existing persisted Feishu cards are never rewritten automatically. When the editor recognizes a hard-coded
  default status-color path, it may offer an explicit "apply dynamic status colors" action that stages the
  binding and template reference changes for preview; the user must save them.
- "Restore default template" remains a separate explicit action and warns that it replaces the complete card
  JSON.

## Testing Decisions

- The primary test seam for renderer behavior is `@tocsin/destinations` unit tests over template model, context construction helpers, interpolation, diagnostics, and Feishu preview/send behavior.
- Feishu sender tests should assert both text and card wire payloads using fake fetch and deterministic clock.
- Feishu tests must assert preview/rendered payloads do not include signing fields or secrets.
- Template tests should assert unknown variables fail before rendering, missing labels render as empty strings, and JSON path diagnostics identify nested string fields.
- Template tests should assert nested payload scalars and array indexes render, missing or non-scalar payload paths render empty, sensitive keys render `[REDACTED]`, and raw Header paths remain unavailable.
- Binding tests should cover each allowed selector, exact case matching, fallback behavior, literal output,
  unknown references, invalid selectors, missing fallback, unused-binding warnings, and rejection of non-string
  outputs.
- Feishu tests should assert the default card renders a red header for `firing`, green for `resolved`, and grey
  for `unknown`, while preview and send continue using the same renderer.
- Registry tests should assert destination catalog remains client-safe and exposes template mode metadata without leaking schema, send functions, or secret fields.
- Configuration integration tests should assert Destination create/update rejects invalid templates and TOML import/export uses `template`.
- Destination service preview tests should assert preview returns safe context, rendered payload, diagnostics, and redacted raw payload reference when a historical Event sample is selected.
- UI tests should focus on user-visible behavior: selecting Feishu template mode, editing JSON, inserting variables, previewing with a sample Event, seeing diagnostics, and avoiding secret exposure.
- Dynamic-property UI tests should cover editing case mappings, adapter-aware color selection, previewing all
  configured status cases and fallback, applying dynamic status colors to a recognized existing card, and never
  rewriting an existing template without an explicit save.
- Delivery worker or delivery execution tests should assert runtime template configuration errors are non-retryable.
- Tests should prefer external behavior at package/service/UI boundaries over private helper implementation details.

## Out of Scope

- Independent Template resources or template reuse across Destinations.
- Long-term compatibility with `messageTemplate`.
- Migration logic for old `messageTemplate` data.
- User JavaScript, expression language, shell, SQL, dynamic code, loops, conditionals, functions, or default-value expressions.
- Multiple templates or full-card variants selected by Source, status, severity, label, or another field.
- Conditional insertion, removal, replacement, or merging of JSON objects, arrays, card elements, sections, or
  actions.
- Multi-field selectors, selector precedence, boolean expressions, nested bindings, recursive binding values, or
  bindings that return non-string JSON values.
- Arbitrary `event.labels.*` binding selectors.
- Dynamic-property UI for Slack, Email, or generic webhook in the first slice.
- Direct raw Header variables, unredacted payload access, whole-object/whole-array payload interpolation, or payload expressions beyond scalar path lookup.
- Direct source token, destination config, destination secret, raw header, route, or delivery attempt variables.
- Complete Feishu card schema replication.
- Feishu card drag-and-drop designer or WYSIWYG editor.
- Feishu interactive callback/action handling.
- Slack blocks implementation.（不在第一个切片内；已由后续切片交付，见「模板模式全貌」）
- Email HTML implementation.（不在第一个切片内；已由后续切片以 `htmlTemplate` 字段交付，见「模板模式全貌」）
- Generic webhook JSON payload template implementation.（不在第一个切片内；已由后续切片交付，见「模板模式全貌」）
- Kubernetes/Helm/deployment changes.
- New database table, column, or persistence relation.

## Further Notes

- This PRD should be implemented as vertical slices. The recommended first slice is shared destination template model/renderer/diagnostics plus Feishu text/card rendering in `@tocsin/destinations`.
- The second slice should expose Feishu template modes through manifest/catalog and adapt config/TOML/form data away from `messageTemplate`.
- The UI slice should only begin after preview diagnostics and result shape are stable enough to avoid editor churn.
- Future destination modes should reuse the same TemplateContext and diagnostics model unless a follow-up PRD explicitly changes the safety boundary.
